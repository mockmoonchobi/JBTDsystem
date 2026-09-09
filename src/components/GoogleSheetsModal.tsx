import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  AlertOctagon,
  Table, 
  LogOut,
  FileSpreadsheet,
  Check,
  Zap,
  Download,
  Upload,
  Database,
  Sliders,
  Building2,
  Users,
  UserPlus,
  Share2,
  Trash2,
  Copy,
  Link,
  Shield,
  Globe,
  ChevronDown,
  ChevronUp,
  Mail,
  Info,
  Lock,
  Edit3,
  Eye,
  UploadCloud,
  RotateCcw
} from 'lucide-react';
import { User } from 'firebase/auth';
import { googleSignIn, logout, initAuth, getAccessToken, getCurrentUser } from '../lib/googleAuth';
import { 
  findOrCreateSpreadsheet, 
  getSpreadsheetPermissions, 
  shareSpreadsheetWithUser, 
  removeSpreadsheetPermission, 
  updateSpreadsheetPermissionRole, 
  validateAndConnectSpreadsheet,
  SheetPermission 
} from '../lib/googleSheets';
import { TempleProfile, TempleInfo, Household } from '../types';
import { safeStorage, loadJsonState, saveJsonState } from '../utils/storageUtils';
import { isTutorialDataRemaining } from '../utils/tutorialDetector';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncStatus: 'synced' | 'syncing' | 'error' | 'disconnected';
  lastSyncTime: string | null;
  syncErrorMessage: string | null;
  onTriggerManualSync: () => void;
  onPullFromSheets?: () => Promise<void>;
  onSyncWithGoogleDrive?: (token: string, explicitSheetId?: string, isCleanImport?: boolean) => Promise<{ success: boolean; count: number }>;
  onCleanWriteToSheets?: (token: string, explicitSheetId?: string) => Promise<{ success: boolean; count: number; sheetInfo?: { id: string; url: string } }>;
  onResetAndCleanImport?: (token: string, sheetId: string) => Promise<{ success: boolean; count: number }>;
  onDisconnect?: () => void | Promise<void>;
  onExportExcel?: (targetTempleId?: string | 'ALL') => void;
  onImportExcel?: (file: File, targetTempleId?: string | 'ALL') => Promise<{ success: boolean; message: string } | void> | void;
  onOpenImportModal?: () => void;
  onRestoreBackup?: () => Promise<{ success: boolean; message: string }>;
  onResetDatabase?: () => void | Promise<void>;
  temples?: TempleProfile[];
  templeInfo?: TempleInfo;
  households?: Household[];
  activeTempleId?: string;
  isSharedMode?: boolean;
  sharedSheetId?: string | null;
  onResetToInitialStartup?: () => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  syncStatus,
  lastSyncTime,
  syncErrorMessage,
  onTriggerManualSync,
  onPullFromSheets,
  onSyncWithGoogleDrive,
  onCleanWriteToSheets,
  onResetAndCleanImport,
  onDisconnect,
  onExportExcel,
  onImportExcel,
  onOpenImportModal,
  onRestoreBackup,
  onResetDatabase,
  temples = [],
  templeInfo,
  households = [],
  activeTempleId = 'temple-main',
  isSharedMode = false,
  sharedSheetId = null,
  onResetToInitialStartup,
}) => {
  const [activeTab, setActiveTab] = useState<'excel' | 'sheets'>(() => isSharedMode ? 'sheets' : 'excel');
  const [user, setUser] = useState<User | null>(() => getCurrentUser());
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info' | 'loading'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selected export mode & target temple (デフォルト: 全寺院)
  const [exportTargetTempleId, setExportTargetTempleId] = useState<string | 'ALL'>('ALL');
  // Selected import mode & target temple (デフォルト: 全寺院)
  const [importTargetTempleId, setImportTargetTempleId] = useState<string | 'ALL'>('ALL');

  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  const [spreadsheetInfo, setSpreadsheetInfo] = useState<{ id: string; url: string } | null>(() => {
    return loadJsonState<{ id: string; url: string } | null>('temple_google_sheet_info', null);
  });

  // Sharing & Permissions State
  const [permissions, setPermissions] = useState<SheetPermission[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState<boolean>(false);
  const [shareEmail, setShareEmail] = useState<string>('');
  const [shareRole, setShareRole] = useState<'writer' | 'reader'>('writer');
  const [shareSendNotification, setShareSendNotification] = useState<boolean>(true);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedStaffLink, setCopiedStaffLink] = useState<boolean>(false);

  // Database Reset State (寺院情報の初期化と同等)
  const [showResetDbModal, setShowResetDbModal] = useState<boolean>(false);
  const [isResetDbAgreed, setIsResetDbAgreed] = useState<boolean>(false);
  const [showResetAndLoginModal, setShowResetAndLoginModal] = useState<boolean>(false);
  const [showCleanWriteModal, setShowCleanWriteModal] = useState<boolean>(false);
  const [showTutorialWarningModal, setShowTutorialWarningModal] = useState<boolean>(false);
  const [showSharedDisconnectChoiceModal, setShowSharedDisconnectChoiceModal] = useState<boolean>(false);

  // チュートリアルデータ残置判定（寺院情報の一致、またはDA/D1かつ電話番号に●●●●混入）
  const checkTutorialRemaining = () => {
    return isTutorialDataRemaining(temples, templeInfo, households);
  };

  // 「Googleシートと連携」押下時のガード
  const handleInitiateLogin = () => {
    if (checkTutorialRemaining()) {
      setShowTutorialWarningModal(true);
      return;
    }
    handleLogin(false);
  };

  // 「Googleシートを初期化して書込」押下時のガード
  const handleInitiateCleanWrite = () => {
    if (checkTutorialRemaining()) {
      setShowTutorialWarningModal(true);
      return;
    }
    setShowCleanWriteModal(true);
  };

  useEffect(() => {
    if (isOpen) {
      setExportTargetTempleId('ALL');
      setImportTargetTempleId('ALL');
      const savedInfo = loadJsonState<{ id: string; url: string } | null>('temple_google_sheet_info', null);
      setSpreadsheetInfo(savedInfo);
      setUser(getCurrentUser());
    }
  }, [isOpen]);

  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser) => {
        setUser(currentUser);
        const savedInfo = loadJsonState<{ id: string; url: string } | null>('temple_google_sheet_info', null);
        if (savedInfo) setSpreadsheetInfo(savedInfo);
      },
      () => {
        setUser(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch permissions when spreadsheetInfo is available
  const loadPermissions = async (sheetId: string) => {
    setLoadingPermissions(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const list = await getSpreadsheetPermissions(token, sheetId);
      setPermissions(list);
    } catch (err: any) {
      console.warn('Failed to load permissions:', err);
    } finally {
      setLoadingPermissions(false);
    }
  };

  useEffect(() => {
    if (isOpen && isSharedMode) {
      setActiveTab('sheets');
    }
  }, [isOpen, isSharedMode]);

  useEffect(() => {
    if (isOpen && activeTab === 'sheets' && user && spreadsheetInfo?.id && !isSharedMode) {
      loadPermissions(spreadsheetInfo.id);
    }
  }, [isOpen, activeTab, user, spreadsheetInfo?.id, isSharedMode]);

  if (!isOpen) return null;

  const isConnected = Boolean(user && spreadsheetInfo?.id && syncStatus !== 'disconnected');

  // 共有データへの再接続ハンドラー（共有モード専用：自分のDrive検索や新規作成は絶対に呼ばない）
  const handleReconnectSharedSheet = async () => {
    setLoading(true);
    setStatusMessage({ type: 'loading', text: 'Googleアカウントにログインし、共有スプレッドシートに再接続中...' });
    try {
      let token = await getAccessToken();
      let currentUser = getCurrentUser();

      if (!token || !currentUser) {
        const res = await googleSignIn();
        if (!res) {
          setStatusMessage({ type: 'info', text: 'Googleログインがキャンセルされました。' });
          setLoading(false);
          return;
        }
        token = res.accessToken;
        currentUser = res.user;
        setUser(res.user);
      } else {
        setUser(currentUser);
      }

      const targetSheetId = sharedSheetId || spreadsheetInfo?.id;
      if (!targetSheetId) {
        throw new Error('共有スプレッドシートのIDが見つかりません。');
      }

      setStatusMessage({ type: 'loading', text: '共有スプレッドシートを確認・再接続中...' });
      const sheet = await findOrCreateSpreadsheet(token, false, {
        preferredSheetId: targetSheetId,
        strictSheetIdOnly: true,
        onProgress: (text) => setStatusMessage({ type: 'loading', text }),
      });
      setSpreadsheetInfo(sheet);
      saveJsonState('temple_google_sheet_info', sheet);

      if (onSyncWithGoogleDrive) {
        setStatusMessage({ type: 'loading', text: '共有スプレッドシートから最新データを同期中...' });
        await onSyncWithGoogleDrive(token, sheet.id);
      }
      setStatusMessage({ type: 'success', text: '共有スプレッドシートとの再接続・同期が完了しました。' });
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message?.includes('closed-by-user') ||
        err?.message?.includes('キャンセル')
      ) {
        setStatusMessage({ type: 'info', text: 'Googleログインがキャンセルされました。' });
        return;
      }
      console.error('Shared sheet reconnect error:', err);
      setStatusMessage({ type: 'error', text: `再接続エラー: ${err.message || '共有スプレッドシートへの接続に失敗しました。'}` });
    } finally {
      setLoading(false);
    }
  };

  // 連携中止＆初期状態（ブラウザ更新・ランチャー画面）へ戻るハンドラー
  const handleConfirmResetToInitialStartup = () => {
    if (window.confirm(
      '共有データとの連携を終了し、アプリの初期状態に戻りますか？\n\n' +
      '※端末内の共有データ一時キャッシュは安全に消去され、起動画面（ブラウザを更新した初期状態）に戻ります。'
    )) {
      if (onResetToInitialStartup) {
        onResetToInitialStartup();
      } else {
        safeStorage.removeItem('temple_google_sheet_info');
        safeStorage.removeItem('temple_google_sheet_last_sync');
        sessionStorage.removeItem('renge_shared_session_mode');
        sessionStorage.removeItem('renge_shared_sheet_id');
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.delete('sheetId');
          window.history.replaceState(null, '', url.pathname);
          window.location.href = url.pathname;
        }
      }
    }
  };

  // Handle Google Login & Setup Auto-Sync
  const handleLogin = async (isCleanImport: boolean = false) => {
    const clean = typeof isCleanImport === 'boolean' ? isCleanImport : false;
    if (!clean && checkTutorialRemaining()) {
      setShowTutorialWarningModal(true);
      return;
    }
    setLoading(true);
    setStatusMessage({ type: 'loading', text: 'Googleアカウント認証中...' });
    try {
      let token = await getAccessToken();
      let currentUser = getCurrentUser();

      if (!token || !currentUser) {
        const res = await googleSignIn();
        if (!res) {
          setStatusMessage({ type: 'info', text: 'Googleログインがキャンセルされました。' });
          setLoading(false);
          return;
        }
        token = res.accessToken;
        currentUser = res.user;
      }
      setUser(currentUser);
      setStatusMessage({ type: 'loading', text: 'GoogleDrive上のデータを確認・連携中...' });

      // Auto-detect or create Google Sheet
      const sheet = await findOrCreateSpreadsheet(token, false, {
        preferredSheetId: spreadsheetInfo?.id,
        onProgress: (text) => setStatusMessage({ type: 'loading', text }),
      });
      setSpreadsheetInfo(sheet);
      saveJsonState('temple_google_sheet_info', sheet);
      
      // Load permissions
      loadPermissions(sheet.id);

      if (onSyncWithGoogleDrive) {
        const syncRes = await onSyncWithGoogleDrive(token, sheet.id, clean);
        setStatusMessage({ 
          type: 'success', 
          text: `ログイン成功: ${currentUser.email} (GoogleDriveデータ連携完了: ${syncRes?.count ?? 0}件)` 
        });
      } else {
        // Trigger initial sync after login
        setTimeout(() => {
          onTriggerManualSync();
        }, 500);
      }
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message?.includes('closed-by-user') ||
        err?.message?.includes('キャンセル')
      ) {
        setStatusMessage({ type: 'info', text: 'Googleログインがキャンセルされました。' });
        setLoading(false);
        return;
      }
      if (
        err?.code === 'auth/popup-blocked' ||
        err?.message?.includes('popup-blocked')
      ) {
        setStatusMessage({
          type: 'error',
          text: 'ブラウザのポップアップがブロックされました。GmailやLINE等のアプリ内ではなくSafari/Chromeで開き直すか、ブラウザの「ポップアップブロック」設定を解除してください。'
        });
        setLoading(false);
        return;
      }
      console.error(err);
      if (err?.isAuthError || err?.message?.includes('401') || err?.message?.includes('認証')) {
        try {
          setStatusMessage({ type: 'loading', text: 'Googleアカウントに再ログイン中...' });
          const res = await googleSignIn();
          if (res) {
            setUser(res.user);
            const sheet = await findOrCreateSpreadsheet(res.accessToken, false, {
              preferredSheetId: spreadsheetInfo?.id,
              onProgress: (text) => setStatusMessage({ type: 'loading', text }),
            });
            setSpreadsheetInfo(sheet);
            saveJsonState('temple_google_sheet_info', sheet);
            loadPermissions(sheet.id);
            if (onSyncWithGoogleDrive) {
              const syncRes = await onSyncWithGoogleDrive(res.accessToken, sheet.id, clean);
              setStatusMessage({ 
                type: 'success', 
                text: `ログイン成功: ${res.user.email} (GoogleDriveデータ連携完了: ${syncRes?.count ?? 0}件)` 
              });
            }
            return;
          }
        } catch (retryErr: any) {
          setStatusMessage({ type: 'error', text: `認証エラー: ${retryErr.message || 'ログインに失敗しました。'}` });
          return;
        }
      }
      setStatusMessage({ type: 'error', text: `認証エラー: ${err.message || 'ログインに失敗しました。'}` });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setSpreadsheetInfo(null);
    setPermissions([]);
    safeStorage.removeItem('temple_google_sheet_info');
    safeStorage.removeItem('temple_google_sheet_last_sync');
    if (onDisconnect) {
      await onDisconnect();
    }
    setStatusMessage({ type: 'info', text: '連携を解除しました。Googleシートとの自動同期を停止しました。' });
  };

  const handleExecuteResetDatabase = () => {
    setShowResetDbModal(false);
    setIsResetDbAgreed(false);
    if (onResetDatabase) {
      onResetDatabase();
      setStatusMessage({
        type: 'success',
        text: 'データベースを完全に初期化しました。端末のダミーデータが削除され、初期状態に戻りました。',
      });
    }
  };

  // 端末データを初期化して読込 (端末側のデータを完全消去してGoogleシート「寺院管理・檀家過去帳データ」を取り込み)
  const handleExecuteResetAndLogin = async () => {
    setShowResetAndLoginModal(false);
    setLoading(true);
    setStatusMessage({ type: 'loading', text: 'Googleアカウント認証・連携準備中...' });
    try {
      let token = await getAccessToken();
      let currentUser = getCurrentUser();
      if (!token || !currentUser) {
        const res = await googleSignIn();
        if (!res) {
          setStatusMessage({ type: 'info', text: 'Googleログインがキャンセルされました。' });
          setLoading(false);
          return;
        }
        token = res.accessToken;
        currentUser = res.user;
        setUser(res.user);
      }

      setStatusMessage({ type: 'loading', text: 'Googleスプレッドシートを確認中...' });
      const sheet = await findOrCreateSpreadsheet(token, false, {
        preferredSheetId: spreadsheetInfo?.id,
        onProgress: (text) => setStatusMessage({ type: 'loading', text }),
      });
      setSpreadsheetInfo(sheet);
      saveJsonState('temple_google_sheet_info', sheet);
      loadPermissions(sheet.id);

      setStatusMessage({ type: 'loading', text: '端末キャッシュ・操作履歴を消去し、Googleシートから読込中...' });
      if (onResetAndCleanImport) {
        const res = await onResetAndCleanImport(token, sheet.id);
        setStatusMessage({
          type: 'success',
          text: `端末データ初期化・読込完了: 端末キャッシュ・操作履歴を消去し、Googleシートからデータ（${res?.count ?? 0}件）を取り込みました。`,
        });
      } else if (onSyncWithGoogleDrive) {
        if (onResetDatabase) {
          await onResetDatabase();
        }
        const res = await onSyncWithGoogleDrive(token, sheet.id, true /* isCleanImport */);
        setStatusMessage({
          type: 'success',
          text: `端末データ初期化・読込完了: Googleシートからデータ（${res?.count ?? 0}件）を取り込みました。`,
        });
      }
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message?.includes('closed-by-user') ||
        err?.message?.includes('キャンセル')
      ) {
        setStatusMessage({ type: 'info', text: 'Googleログインがキャンセルされました。' });
        return;
      }
      console.error('Reset and clean import error:', err);
      setStatusMessage({ type: 'error', text: `読込エラー: ${err?.message || '初期化読込に失敗しました。'}` });
    } finally {
      setLoading(false);
    }
  };

  // Googleシートを初期化して書込 (GoogleDrive上の既存ファイルを完全消去し、新規ファイルを作成して端末データを書込)
  const handleExecuteCleanWriteToSheets = async () => {
    setShowCleanWriteModal(false);
    if (checkTutorialRemaining()) {
      setShowTutorialWarningModal(true);
      return;
    }
    setLoading(true);
    setStatusMessage({ type: 'loading', text: 'Googleアカウント認証・連携準備中...' });
    try {
      let token = await getAccessToken();
      let currentUser = getCurrentUser();
      if (!token || !currentUser) {
        const res = await googleSignIn();
        if (!res) {
          setStatusMessage({ type: 'info', text: 'Googleログインがキャンセルされました。' });
          setLoading(false);
          return;
        }
        token = res.accessToken;
        currentUser = res.user;
        setUser(res.user);
      }

      setStatusMessage({ type: 'loading', text: '既存ファイルを消去し、新規スプレッドシートを作成して端末データを書き込み中...' });

      if (onCleanWriteToSheets) {
        const writeRes = await onCleanWriteToSheets(token);
        if (writeRes?.sheetInfo) {
          setSpreadsheetInfo(writeRes.sheetInfo);
          loadPermissions(writeRes.sheetInfo.id);
        }
        setStatusMessage({
          type: 'success',
          text: `Googleシートの初期化書き込み完了: 既存ファイルを消去し、新たに作成したファイルへ端末データ（${writeRes?.count ?? 0}件）を書き込みました`,
        });
      } else {
        throw new Error('初期化書き込みハンドラーが見つかりません。');
      }
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message?.includes('closed-by-user') ||
        err?.message?.includes('キャンセル')
      ) {
        setStatusMessage({ type: 'info', text: 'Googleログインがキャンセルされました。' });
        return;
      }
      console.error(err);
      setStatusMessage({ type: 'error', text: `書込エラー: ${err.message || 'Googleシートへの初期化書き込みに失敗しました。'}` });
    } finally {
      setLoading(false);
    }
  };

  // Get collaboration invite URL (PC & Smartphone fully functional)
  const getShareInviteUrl = () => {
    if (!spreadsheetInfo?.id) return '';
    const baseUrl = typeof window !== 'undefined' && window.location.origin
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://mockmoonchobi.github.io/JBTDsystem/';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${cleanBase}?sheetId=${encodeURIComponent(spreadsheetInfo.id)}`;
  };

  const handleCopyShareLink = () => {
    const link = getShareInviteUrl();
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiedStaffLink(true);
    setTimeout(() => setCopiedStaffLink(false), 2500);
  };

  // Handle adding a user to spreadsheet permissions
  const handleAddUserShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareEmail.trim() || !spreadsheetInfo?.id) return;

    setIsSharing(true);
    setStatusMessage({ type: 'loading', text: `「${shareEmail.trim()}」にGoogleシートの共有権限を付与中...` });
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('認証トークンが見つかりません。再ログインしてください。');

      const shareLink = getShareInviteUrl();
      const emailMessage = `寺院檀家名簿・法要受付管理システムの共同管理（Googleシート連携）の招待通知です。\n以下のリンクを開くと、自動的にGoogleシート連携が立ち上がります（PC・スマホ両対応）：\n${shareLink}\n\n※スマートフォン（GmailアプリやLINE等）で開く場合は、アプリ内の内蔵ブラウザではなく、SafariまたはChromeで開いてください（Googleログインのポップアップブロック回避のため）。`;

      await shareSpreadsheetWithUser(
        token,
        spreadsheetInfo.id,
        shareEmail.trim(),
        shareRole,
        shareSendNotification,
        emailMessage
      );

      setStatusMessage({ 
        type: 'success', 
        text: `「${shareEmail.trim()}」に${shareRole === 'writer' ? '編集' : '閲覧'}権限を共有しました。招待メールに共同管理用アクセスURLを自動記載しました。` 
      });
      setShareEmail('');
      await loadPermissions(spreadsheetInfo.id);
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `共有エラー: ${err.message || '共有設定に失敗しました。'}` });
    } finally {
      setIsSharing(false);
    }
  };

  // Handle removing a permission
  const handleRemovePermission = async (permissionId: string, nameOrEmail: string) => {
    if (!spreadsheetInfo?.id) return;
    if (!confirm(`「${nameOrEmail || 'このユーザー'}」の共有権限を解除しますか？`)) return;

    setStatusMessage({ type: 'loading', text: '共有権限を解除中...' });
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('認証トークンが見つかりません。');

      await removeSpreadsheetPermission(token, spreadsheetInfo.id, permissionId);
      setStatusMessage({ type: 'success', text: `共有権限を解除しました。` });
      await loadPermissions(spreadsheetInfo.id);
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `解除エラー: ${err.message || '共有解除に失敗しました。'}` });
    }
  };

  // Handle updating user role (e.g. reader -> writer)
  const handleUpdatePermissionRole = async (permissionId: string, newRole: 'writer' | 'reader') => {
    if (!spreadsheetInfo?.id) return;
    setStatusMessage({ type: 'loading', text: '権限を変更中...' });
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('認証トークンが見つかりません。');

      await updateSpreadsheetPermissionRole(token, spreadsheetInfo.id, permissionId, newRole);
      setStatusMessage({ type: 'success', text: `権限を「${newRole === 'writer' ? '編集者' : '閲覧者'}」に変更しました。` });
      await loadPermissions(spreadsheetInfo.id);
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `権限変更エラー: ${err.message || '更新に失敗しました。'}` });
    }
  };

  // Copy Sheet Link
  const handleCopyLink = () => {
    if (!spreadsheetInfo?.url) return;
    navigator.clipboard.writeText(spreadsheetInfo.url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Trigger confirmation dialog when user selects a file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingImportFile(file);
      setIsConfirmModalOpen(true);
    }
  };

  // Drag and drop handler
  const handleDropFile = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      setPendingImportFile(file);
      setIsConfirmModalOpen(true);
    }
  };

  // Execute import after user confirms overwrite
  const handleConfirmImport = async () => {
    if (!pendingImportFile || !onImportExcel) return;
    const file = pendingImportFile;
    setIsConfirmModalOpen(false);
    setLoading(true);
    setStatusMessage({ type: 'loading', text: `「${file.name}」を解析・読み込み中...` });
    try {
      const res = await onImportExcel(file, importTargetTempleId);
      if (res && typeof res === 'object' && res.message) {
        setStatusMessage({ type: 'success', text: res.message });
      } else {
        setStatusMessage({ type: 'success', text: `「${file.name}」のデータ取り込みが完了しました。` });
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `取り込みエラー: ${err.message || '読み込みに失敗しました'}` });
    } finally {
      setLoading(false);
      setPendingImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Cancel import
  const handleCancelImport = () => {
    setIsConfirmModalOpen(false);
    setPendingImportFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const allTemplesList: TempleProfile[] = temples.length > 0
    ? temples
    : [{ id: 'temple-main', name: '圓福寺', mountainName: '慈光山', isMain: true, sect: '曹洞宗', chiefPriest: '', postalCode: '', address: '', phone: '', color: '#D4AF37' }];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 font-sans animate-fade-in">
      <div className="bg-white border border-[#D4AF37] shadow-2xl max-w-xl w-full max-h-[88vh] flex flex-col rounded-none overflow-hidden text-[#1A1A1A]">
        {/* Header */}
        <div className="bg-[#1A1A1A] text-[#F9F7F2] px-4 py-3.5 sm:px-5 sm:py-4 border-b border-[#D4AF37] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-emerald-900/80 border border-emerald-500/50 text-emerald-300">
              <Zap className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-serif text-[#F9F7F2] flex items-center gap-2">
                <span>{isSharedMode ? '共有データ連携・同期状況' : 'データ連携・Excel / Googleシート管理'}</span>
                {isSharedMode && (
                  <span className="text-[10px] bg-emerald-800/90 text-emerald-200 px-2 py-0.5 border border-emerald-400 font-sans font-normal">
                    🤝 共有データアクセス中
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-[#CCCCCC] font-sans">
                {isSharedMode 
                  ? '共有スプレッドシートとの常時同期および接続設定' 
                  : '全寺院一括 ＆ 各寺院個別 Excel入出力・Googleスプレッドシート自動同期'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#CCCCCC] hover:text-white hover:bg-[#333333] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher: 共有モード時はExcelタブが不要なため非表示 */}
        {!isSharedMode && (
          <div className="flex border-b border-[#D1CEC7] bg-[#F2EFE9] text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('excel')}
              className={`flex-1 py-2.5 px-3 flex items-center justify-center space-x-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'excel'
                  ? 'bg-white text-[#1A1A1A] border-[#D4AF37] shadow-xs'
                  : 'text-[#666666] hover:text-[#1A1A1A] border-transparent'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-[#D4AF37]" />
              <span>① Excel入出力 (.xlsx) ＆ 他DB取込</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sheets')}
              className={`flex-1 py-2.5 px-3 flex items-center justify-center space-x-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'sheets'
                  ? 'bg-white text-[#1A1A1A] border-[#D4AF37] shadow-xs'
                  : 'text-[#666666] hover:text-[#1A1A1A] border-transparent'
              }`}
            >
              <Zap className={`w-4 h-4 ${syncStatus === 'synced' ? 'text-emerald-500' : 'text-[#888888]'}`} />
              <span>② Googleシート常時自動同期</span>
              {syncStatus === 'synced' && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
          </div>
        )}

        {/* Content Body (Scrollable) */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Status Message if any */}
          {statusMessage && (
            <div
              className={`p-2.5 text-xs border flex items-center justify-between space-x-2 shrink-0 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                  : 'bg-indigo-50 text-indigo-800 border-indigo-300'
              }`}
            >
              <div className="flex items-center space-x-2 min-w-0">
                {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                {statusMessage.type === 'loading' && <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />}
                {statusMessage.type === 'info' && <Info className="w-4 h-4 text-indigo-600 shrink-0" />}
                <span className="font-medium">{statusMessage.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusMessage(null)}
                className="text-gray-400 hover:text-gray-700 p-0.5 transition-colors cursor-pointer shrink-0"
                title="閉じる"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ==================== TAB 1: EXCEL IO & EXTERNAL DB ==================== */}
          {!isSharedMode && activeTab === 'excel' && (
            <div className="space-y-3.5">
              {/* Excel Local File Export/Import */}
              <div className="bg-[#FAF8F5] border border-[#D4AF37]/60 p-3.5 space-y-3">
                <div className="flex items-center space-x-2 border-b border-[#EBE7DF] pb-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-[#D4AF37]" />
                  <span className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A]">
                    Excel (.xlsx) ワークシート 入出力
                  </span>
                </div>
                <p className="text-[11px] text-[#555555]">
                  全寺院一括または指定寺院単体で、檀家名簿・過去帳・法要・出納・マスタ・一括会計受付データを安全に書き出し・取り込みできます。
                </p>

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                />

                {/* Export Card */}
                <div className="bg-white p-2.5 border border-[#D1CEC7] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                    <span className="font-bold text-[#1A1A1A] flex items-center gap-1">
                      <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>Excel書き出し（エクスポート）</span>
                    </span>
                    <div className="flex items-center space-x-1">
                      <span className="text-[11px] text-[#666666]">対象:</span>
                      <select
                        value={exportTargetTempleId}
                        onChange={(e) => setExportTargetTempleId(e.target.value)}
                        className="text-xs bg-[#FAF8F5] border border-[#D1CEC7] px-2 py-0.5 font-bold text-[#1A1A1A] focus:outline-hidden"
                      >
                        <option value="ALL">【全寺院】一括</option>
                        {allTemplesList.map((t) => (
                          <option key={t.id || 'temple-main'} value={t.id || 'temple-main'}>
                            {t.name}（{t.isMain ? '本寺' : '兼務'}）
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {onExportExcel && (
                    <button
                      onClick={() => onExportExcel(exportTargetTempleId)}
                      className="w-full py-1.5 px-3 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] border border-[#D4AF37]/60 text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>
                        {exportTargetTempleId === 'ALL'
                          ? '全寺院データを一括書き出し (.xlsx)'
                          : `「${allTemplesList.find((t) => (t.id || 'temple-main') === exportTargetTempleId)?.name || '指定寺院'}」のデータのみ書き出し (.xlsx)`}
                      </span>
                    </button>
                  )}
                  <p className="text-[10px] text-[#777777] leading-tight">
                    ※ 檀家名簿・過去帳・法要・出納・ToDo・一括会計に加え、操作・削除履歴（共同管理・監査用）を含めて完全出力します。
                  </p>
                </div>

                {/* Import Card with Drop Zone */}
                <div 
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={handleDropFile}
                  className={`p-2.5 border transition-all ${
                    isDraggingFile
                      ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400'
                      : 'bg-white border-[#D1CEC7]'
                  } space-y-2`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                    <span className="font-bold text-[#1A1A1A] flex items-center gap-1">
                      <Upload className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Excel読み込み（インポート）</span>
                    </span>
                    <div className="flex items-center space-x-1">
                      <span className="text-[11px] text-[#666666]">取込先:</span>
                      <select
                        value={importTargetTempleId}
                        onChange={(e) => setImportTargetTempleId(e.target.value)}
                        className="text-xs bg-[#FAF8F5] border border-[#D1CEC7] px-2 py-0.5 font-bold text-[#1A1A1A] focus:outline-hidden"
                      >
                        <option value="ALL">【全寺院】ファイル内所属をそのまま復元</option>
                        {allTemplesList.map((t) => (
                          <option key={t.id || 'temple-main'} value={t.id || 'temple-main'}>
                            全データを「{t.name}」所属として取り込む
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {onImportExcel && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2 px-3 bg-[#2A2A2A] hover:bg-[#333333] text-white border border-[#666666] text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Excelファイルを選択して読み込み (.xlsx)</span>
                    </button>
                  )}
                  <p className="text-[10px] text-gray-500 text-center">
                    ※ 読み込み前に確認・警告画面が表示されます（ファイルをここにドロップしても選択可能）
                  </p>
                </div>
              </div>

              {/* External DB / Software Wizard Card */}
              {onOpenImportModal && (
                <div className="bg-white border border-[#D1CEC7] p-3 space-y-2">
                  <div className="flex items-center justify-between border-b border-[#EBE7DF] pb-1.5">
                    <div className="flex items-center space-x-1.5">
                      <Database className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span className="font-bold text-xs text-[#1A1A1A]">
                        他社ソフト（沙羅・寺務PRO・Access等）からの移行
                      </span>
                    </div>
                    <span className="px-1.5 py-0.2 bg-[#D4AF37]/20 text-[#8C6D1F] text-[10px] font-bold">
                      対応
                    </span>
                  </div>
                  <p className="text-[11px] text-[#666666]">
                    列の自動マッピングや和暦自動変換に対応したウィザードを起動します。
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenImportModal();
                    }}
                    className="w-full py-1.5 px-3 bg-[#FAF9F5] hover:bg-[#F2EFE9] border border-[#D1CEC7] text-[#1A1A1A] text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>他DB・CSV取込ウィザードを開く</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 2: GOOGLE SHEETS SYNC ==================== */}
          {activeTab === 'sheets' && (
            <div className="space-y-3.5">
              {/* Sync Status Live Banner */}
              <div className="bg-[#1A1A1A] text-[#F9F7F2] p-3.5 border border-[#D4AF37]/50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Googleシート常時自動同期ステータス</span>
                  </span>
                  <span className={`px-2 py-0.5 text-xs font-bold flex items-center space-x-1 ${
                    syncStatus === 'synced'
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/60'
                      : syncStatus === 'syncing'
                      ? 'bg-amber-900/80 text-amber-200 border border-amber-500'
                      : syncStatus === 'error'
                      ? 'bg-rose-900/80 text-rose-200 border border-rose-500'
                      : 'bg-gray-800 text-gray-400 border border-gray-600'
                  }`}>
                    {syncStatus === 'synced' && <Check className="w-3 h-3 text-emerald-400" />}
                    {syncStatus === 'syncing' && <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />}
                    {syncStatus === 'error' && <AlertCircle className="w-3 h-3 text-rose-400" />}
                    <span>
                      {syncStatus === 'synced' ? '常時自動同期中' :
                       syncStatus === 'syncing' ? '保存・同期中...' :
                       syncStatus === 'error' ? '同期エラー' : '未接続'}
                    </span>
                  </span>
                </div>

                <div className="text-xs text-[#DDDDDD] space-y-0.5 font-mono pt-1 border-t border-[#333333]">
                  <div>最終同期時刻: <span className="text-[#F9F7F2] font-bold">{lastSyncTime || '同期未実施'}</span></div>
                  {syncErrorMessage && (
                    <div className="text-rose-400 text-[11px] pt-0.5">エラー: {syncErrorMessage}</div>
                  )}
                </div>
              </div>

              {/* Account & Sheet Information */}
              <div className="bg-[#F9F7F2] border border-[#D1CEC7] p-3.5 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-[#EBE7DF] pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-[#666666] uppercase tracking-wider">連携Googleアカウント</span>
                    {user ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 border border-emerald-300">
                        ログイン中
                      </span>
                    ) : (
                      <span className="text-[10px] bg-gray-200 text-gray-700 font-bold px-1.5 py-0.5 border border-gray-300">
                        未ログイン
                      </span>
                    )}
                  </div>
                  {user && (
                    <button
                      type="button"
                      onClick={isSharedMode ? () => setShowSharedDisconnectChoiceModal(true) : handleLogout}
                      className="px-2 py-0.5 bg-white hover:bg-gray-100 border border-[#D1CEC7] text-gray-700 font-bold text-[11px] flex items-center space-x-1 transition-colors cursor-pointer"
                      title={
                        isSharedMode
                          ? '共有データ連携の操作（再接続または連携中止）を選択します'
                          : isConnected
                          ? 'Googleシートとの自動同期を停止して連携を解除します'
                          : 'Googleアカウントからログアウトします'
                      }
                    >
                      <LogOut className="w-3 h-3" />
                      <span>{isSharedMode ? '連携解除操作' : isConnected ? '連携解除' : 'ログアウト'}</span>
                    </button>
                  )}
                </div>

                {user ? (
                  <div className="flex items-center space-x-3 pt-0.5">
                    <div className="w-7 h-7 rounded-full bg-emerald-800 text-emerald-100 flex items-center justify-center font-bold text-xs shrink-0">
                      {user.displayName ? user.displayName.charAt(0) : 'G'}
                    </div>
                    <div className="overflow-hidden">
                      <div className="font-bold text-[#1A1A1A] truncate">{user.displayName || 'Google Account'}</div>
                      <div className="text-[#666666] font-mono text-[10px] truncate">{user.email}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-[#666666] leading-relaxed">
                    {isSharedMode
                      ? '共有スプレッドシートへのアクセスにはGoogleアカウントでのログインが必要です。'
                      : 'Googleアカウントと連携すると、スプレッドシートとのリアルタイム自動同期・バックアップが行えます。連携方法を選択してください。'}
                  </div>
                )}

                {/* ---------------------------------------------------- */}
                {/* 1. 未接続の場合 */}
                {/* ---------------------------------------------------- */}
                {!isConnected ? (
                  <div className="space-y-3 pt-2 border-t border-[#EBE7DF]">
                    <div className="bg-amber-50 border border-amber-300 p-2 text-[11px] text-amber-900 rounded-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>
                          {isSharedMode
                            ? '共有スプレッドシートとの接続が切断されています。以下のいずれかを選択してください。'
                            : user 
                            ? `アカウント（${user.email}）で認証中ですが、スプレッドシートは未接続です。以下の連携方法を選択してください。` 
                            : 'スプレッドシート未連携です。以下の連携方法を選択して同期を開始してください。'}
                        </span>
                      </div>
                    </div>

                    {isSharedMode ? (
                      /* 共有モード専用の未接続時選択肢（選択肢①と選択肢②のみ） */
                      <div className="space-y-2.5">
                        {/* 選択肢①: 共有データと再接続 */}
                        <div className="bg-emerald-50/70 border-2 border-emerald-500 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs rounded-xs">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center space-x-2 text-emerald-950 font-bold text-xs sm:text-sm">
                              <RefreshCw className={`w-4 h-4 text-emerald-600 shrink-0 ${loading ? 'animate-spin' : ''}`} />
                              <span>① 共有データと再接続（共有シートに再接続）</span>
                              <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 font-normal">推奨</span>
                            </div>
                            <p className="text-[11px] text-emerald-900/90 leading-relaxed">
                              指定された共有スプレッドシートに安全に再接続し、最新データを読み込んで自動同期を再開します（個人のGoogleドライブのデータとは一切混同・作成されません）。
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleReconnectSharedSheet}
                            disabled={loading}
                            className="w-full sm:w-auto sm:min-w-[210px] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer shadow-xs rounded-xs whitespace-nowrap shrink-0"
                            title="共有スプレッドシートに再接続します"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            <span>共有データと再接続</span>
                          </button>
                        </div>

                        {/* 選択肢②: 連携を中止して初期状態に戻る */}
                        <div className="bg-[#FAF9F5] border border-gray-400 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs rounded-xs">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs sm:text-sm">
                              <RotateCcw className="w-4 h-4 text-gray-700 shrink-0" />
                              <span>② 連携を中止して初期状態に戻る（ブラウザ更新）</span>
                            </div>
                            <p className="text-[11px] text-gray-600 leading-relaxed">
                              共有データとの連携を終了し、端末内に残った一時データを消去して初期起動ランチャー画面（PC読込・通常連携・新規など）に戻ります。
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleConfirmResetToInitialStartup}
                            disabled={loading}
                            className="w-full sm:w-auto sm:min-w-[210px] py-2.5 px-4 bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-800 border border-gray-400 font-bold text-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer shadow-xs rounded-xs whitespace-nowrap shrink-0"
                            title="初期起動画面に戻ります"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-gray-600" />
                            <span>初期状態に戻る</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 通常モード：従来通りの3つの連携ボタン */
                      <div className="space-y-2.5">
                        {/* 1. Googleシートと連携 */}
                        <div className="bg-[#FAF9F5] border border-[#D4AF37]/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs rounded-xs">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center space-x-2 text-[#1A1A1A] font-bold text-xs">
                              <FileSpreadsheet className="w-4 h-4 text-[#D4AF37] shrink-0" />
                              <span>Googleシートと連携</span>
                              <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 border border-amber-300 font-normal">通常連携</span>
                            </div>
                            <p className="text-[11px] text-[#666666] leading-relaxed">
                              この端末にある現在のデータ（檀家・過去帳等）を保持したまま、Googleアカウントと連携して自動同期を開始します。
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleInitiateLogin}
                            disabled={loading}
                            className="w-full sm:w-auto sm:min-w-[210px] py-2.5 px-4 bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-50 text-[#D4AF37] font-bold text-xs flex items-center justify-center space-x-2 transition-colors border border-[#D4AF37]/50 cursor-pointer shadow-xs rounded-xs whitespace-nowrap shrink-0"
                            title="現在の端末データを保持してGoogleアカウントと自動同期を開始します"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>Googleシートと連携</span>
                          </button>
                        </div>

                        {/* 2. 端末データを初期化して読込 */}
                        <div className="bg-rose-50/40 border border-rose-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs rounded-xs">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center space-x-2 text-rose-950 font-bold text-xs">
                              <Database className="w-4 h-4 text-rose-600 shrink-0" />
                              <span>端末データを初期化して読込</span>
                              <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 border border-rose-300 font-normal">クラウド優先</span>
                            </div>
                            <p className="text-[11px] text-rose-900/80 leading-relaxed">
                              端末側のデータを完全消去してGoogleシート「寺院管理・檀家過去帳データ」を取り込みます。
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setShowResetAndLoginModal(true);
                            }}
                            disabled={loading}
                            className="w-full sm:w-auto sm:min-w-[210px] py-2.5 px-4 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-800 border border-rose-300 font-bold text-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer shadow-xs rounded-xs whitespace-nowrap shrink-0"
                            title="端末側のデータを完全消去してGoogleシート「寺院管理・檀家過去帳データ」を取り込みます"
                          >
                            <Database className="w-3.5 h-3.5 text-rose-600" />
                            <span>端末データを初期化して読込</span>
                          </button>
                        </div>

                        {/* 3. Googleシートを初期化して書込 */}
                        <div className="bg-sky-50/40 border border-sky-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs rounded-xs">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center space-x-2 text-sky-950 font-bold text-xs">
                              <UploadCloud className="w-4 h-4 text-sky-600 shrink-0" />
                              <span>Googleシートを初期化して書込</span>
                              <span className="text-[10px] bg-sky-100 text-sky-800 px-1.5 py-0.5 border border-sky-300 font-normal">端末優先</span>
                            </div>
                            <p className="text-[11px] text-sky-900/80 leading-relaxed">
                              Googleシートのデータを完全消去して端末側のデータを「寺院管理・檀家過去帳データ」に書き込みます。
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleInitiateCleanWrite}
                            disabled={loading}
                            className="w-full sm:w-auto sm:min-w-[210px] py-2.5 px-4 bg-sky-50 hover:bg-sky-100 disabled:opacity-50 text-sky-800 border border-sky-300 font-bold text-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer shadow-xs rounded-xs whitespace-nowrap shrink-0"
                            title="Googleシートのデータを完全消去して端末側のデータを「寺院管理・檀家過去帳データ」に書き込みます"
                          >
                            <UploadCloud className="w-3.5 h-3.5 text-sky-600" />
                            <span>Googleシートを初期化して書込</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ---------------------------------------------------- */
                  /* 2. 接続中の場合：同期先シート詳細 & モード変更の導線 */
                  /* ---------------------------------------------------- */
                  spreadsheetInfo && (
                    <div className="pt-2 border-t border-[#EBE7DF] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#666666]">
                          {isSharedMode ? '接続中・共有スプレッドシート' : '同期先スプレッドシート'}
                        </span>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={handleCopyLink}
                            className="text-xs font-bold text-gray-700 hover:text-black flex items-center space-x-1 cursor-pointer bg-white px-2 py-0.5 border border-[#D1CEC7]"
                            title="スプレッドシートのリンクをコピー"
                          >
                            {copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedLink ? 'コピー完了' : 'URLコピー'}</span>
                          </button>
                          <a
                            href={spreadsheetInfo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-indigo-700 hover:text-indigo-900 flex items-center space-x-1 underline text-[11px]"
                          >
                            <span>Google Sheetsで開く</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                      <div className="bg-white p-2 border border-[#D1CEC7] flex items-center space-x-2">
                        <Table className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <div className="overflow-hidden leading-tight flex-1">
                          <div className="font-bold text-[#1A1A1A] truncate text-xs">
                            {isSharedMode ? '共有スプレッドシート（共同管理データ）' : '寺院管理・檀家過去帳データ'}
                          </div>
                          <div className="text-[9px] text-[#888888] font-mono truncate">ID: {spreadsheetInfo.id}</div>
                        </div>
                      </div>

                      {/* 共有モード時の操作導線 */}
                      {isSharedMode ? (
                        <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={handleReconnectSharedSheet}
                            disabled={loading}
                            className="py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer rounded-xs"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            <span>最新状態に再同期・再接続</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmResetToInitialStartup}
                            disabled={loading}
                            className="py-2 px-3 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer rounded-xs"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-gray-500" />
                            <span>連携を中止して初期状態に戻る</span>
                          </button>
                        </div>
                      ) : (
                        /* 通常モード：初期化再同期アコーディオン */
                        <div className="pt-1">
                          <details className="text-[11px] text-[#666666] border border-[#E5E0D8] bg-[#FAF8F5] p-2 rounded-xs group">
                            <summary className="font-bold text-gray-700 cursor-pointer select-none flex items-center justify-between">
                              <span>データの初期化再同期（端末初期化 / シート初期化）</span>
                              <span className="text-[10px] text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                            </summary>
                            <div className="pt-2.5 space-y-2 border-t border-[#E5E0D8] mt-2">
                              <div className="flex items-center justify-between gap-2 bg-rose-50/60 border border-rose-200 p-2 rounded-xs">
                                <div>
                                  <div className="font-bold text-rose-900">端末データを初期化して読込</div>
                                  <div className="text-[10px] text-rose-800">端末を初期化し、シートのデータを取り込み直します</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setShowResetAndLoginModal(true)}
                                  className="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 font-bold text-[10px] shrink-0 cursor-pointer"
                                >
                                  実行
                                </button>
                              </div>
                              <div className="flex items-center justify-between gap-2 bg-sky-50/60 border border-sky-200 p-2 rounded-xs">
                                <div>
                                  <div className="font-bold text-sky-900">Googleシートを初期化して書込</div>
                                  <div className="text-[10px] text-sky-800">シート側を消去し、端末データで新規作成・上書きします</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleInitiateCleanWrite}
                                  className="px-2 py-1 bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300 font-bold text-[10px] shrink-0 cursor-pointer"
                                >
                                  実行
                                </button>
                              </div>
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>

              {/* ==================== GOOGLE SHEET SHARING & COLLABORATION SECTION (通常モードのみ) ==================== */}
              {!isSharedMode && user && spreadsheetInfo && (
                <div className="border border-[#D4AF37]/60 bg-white p-3.5 sm:p-4 space-y-3 shadow-2xs">
                  {/* Section Title */}
                  <div className="flex items-center justify-between border-b border-[#EBE7DF] pb-2">
                    <div className="flex items-center space-x-2">
                      <div className="p-1 bg-[#FAF7F0] border border-[#D4AF37]/50 text-[#8C2D19]">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-xs sm:text-sm text-[#1A1A1A] flex items-center gap-1.5">
                          <span>Googleシートの共有設定・共同管理</span>
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-normal px-1.5 py-0.2 border border-emerald-300">
                            他のGoogleユーザーと共有
                          </span>
                        </h3>
                        <p className="text-[10px] text-[#666666]">
                          副住職・寺族・役員・事務員などのGoogleアカウントを追加して、リアルタイム共同編集・閲覧が可能です。
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadPermissions(spreadsheetInfo.id)}
                      disabled={loadingPermissions}
                      className="p-1 text-gray-500 hover:text-black hover:bg-gray-100 transition-colors cursor-pointer"
                      title="共有リストを再読み込み"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingPermissions ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Add New User Share Form */}
                  <form onSubmit={handleAddUserShare} className="bg-[#FAF8F5] border border-[#E5E0D8] p-3 space-y-2.5 text-xs">
                    <div className="font-bold text-[#1A1A1A] flex items-center space-x-1.5">
                      <UserPlus className="w-3.5 h-3.5 text-[#8C2D19]" />
                      <span>他のGoogleユーザーを招待・共有</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2">
                        <input
                          type="email"
                          value={shareEmail}
                          onChange={(e) => setShareEmail(e.target.value)}
                          placeholder="共有相手のGoogleメールアドレス (例: priest@gmail.com)"
                          required
                          className="w-full px-2.5 py-1.5 border border-[#D1CEC7] bg-white text-xs focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                        />
                      </div>
                      <div>
                        <select
                          value={shareRole}
                          onChange={(e) => setShareRole(e.target.value as 'writer' | 'reader')}
                          className="w-full px-2.5 py-1.5 border border-[#D1CEC7] bg-white text-xs font-bold focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                        >
                          <option value="writer">編集者（読み書き可能）</option>
                          <option value="reader">閲覧者（閲覧のみ）</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center space-x-1.5 text-[11px] text-[#555555] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={shareSendNotification}
                          onChange={(e) => setShareSendNotification(e.target.checked)}
                          className="rounded text-amber-700 focus:ring-amber-500"
                        />
                        <span>共有通知メールを相手に送信する</span>
                      </label>

                      <button
                        type="submit"
                        disabled={isSharing || !shareEmail.trim()}
                        className="px-3 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-50 text-[#D4AF37] font-bold text-xs flex items-center space-x-1.5 transition-colors border border-[#D4AF37]/50 cursor-pointer shadow-2xs"
                      >
                        <Share2 className={`w-3.5 h-3.5 ${isSharing ? 'animate-spin' : ''}`} />
                        <span>{isSharing ? '共有中...' : '共有を追加'}</span>
                      </button>
                    </div>
                  </form>

                  {/* Current Shared Users List */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-[#666666] flex items-center justify-between">
                      <span className="uppercase tracking-wider flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5 text-[#8C2D19]" />
                        <span>アクセス権を持つユーザー一覧 ({permissions.length}名)</span>
                      </span>
                      {loadingPermissions && <span className="text-[10px] text-gray-500">更新中...</span>}
                    </div>

                    {permissions.length === 0 && !loadingPermissions ? (
                      <div className="p-3 text-center text-xs text-gray-500 bg-gray-50 border border-gray-200">
                        共有されているユーザーはいません（オーナーのみ）
                      </div>
                    ) : (
                      <div className="border border-[#D1CEC7] bg-white divide-y divide-[#EBE7DF] max-h-48 overflow-y-auto">
                        {permissions.map((perm) => {
                          const isOwner = perm.role === 'owner';
                          const isAnyone = perm.type === 'anyone';
                          const isCurrentUser = perm.emailAddress === user.email;

                          return (
                            <div key={perm.id} className="p-2 flex items-center justify-between text-xs hover:bg-[#FAF8F5] transition-colors">
                              <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                                {perm.photoLink ? (
                                  <img 
                                    src={perm.photoLink} 
                                    alt="" 
                                    referrerPolicy="no-referrer"
                                    className="w-6 h-6 rounded-full shrink-0" 
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                                    {isAnyone ? <Globe className="w-3.5 h-3.5 text-gray-600" /> : (perm.displayName ? perm.displayName.charAt(0) : 'U')}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="font-bold text-[#1A1A1A] truncate flex items-center gap-1.5">
                                    <span>{isAnyone ? 'リンクを知っている全員（全体公開）' : (perm.displayName || perm.emailAddress || 'ユーザー')}</span>
                                    {isAnyone && (
                                      <span className="text-[9px] bg-rose-100 text-rose-800 px-1 font-bold border border-rose-300">
                                        危険・全体公開中
                                      </span>
                                    )}
                                    {isCurrentUser && (
                                      <span className="text-[9px] bg-amber-100 text-amber-900 px-1 font-normal border border-amber-300">
                                        あなた
                                      </span>
                                    )}
                                  </div>
                                  {isAnyone ? (
                                    <div className="text-[10px] text-rose-600">
                                      URLを知っている全員に公開されています。安全のため右端のゴミ箱アイコンから解除してください。
                                    </div>
                                  ) : (
                                    perm.emailAddress && (
                                      <div className="text-[10px] text-[#666666] font-mono truncate">{perm.emailAddress}</div>
                                    )
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center space-x-1.5 shrink-0">
                                {isOwner ? (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-bold text-[10px] border border-amber-300">
                                    オーナー
                                  </span>
                                ) : (
                                  <>
                                    <select
                                      value={perm.role === 'writer' ? 'writer' : 'reader'}
                                      onChange={(e) => handleUpdatePermissionRole(perm.id, e.target.value as 'writer' | 'reader')}
                                      className="px-1.5 py-0.5 bg-[#FAF8F5] border border-[#D1CEC7] text-[10px] font-bold text-[#1A1A1A] focus:outline-none cursor-pointer"
                                    >
                                      <option value="writer">編集者</option>
                                      <option value="reader">閲覧者</option>
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePermission(perm.id, perm.displayName || perm.emailAddress || (isAnyone ? 'リンクを知っている全員への共有' : ''))}
                                      className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition-colors cursor-pointer rounded-xs"
                                      title={isAnyone ? 'リンク共有を解除' : '共有を解除'}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Collaboration Dedicated Invitation Link Box */}
                  <div className="pt-2">
                    <div className="p-3 bg-emerald-50/90 border border-emerald-300/80 rounded-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center space-x-1.5 text-xs font-bold text-emerald-950">
                          <Users className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span>共同管理者用 共有・招待URL（リンク）</span>
                        </span>
                        <span className="px-1.5 py-0.5 bg-emerald-200 text-emerald-900 text-[10px] font-bold rounded">
                          PC・スマホ両対応
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-900 leading-relaxed">
                        このリンクを副住職様・寺族様等にLINEやメールでお送りください。リンクを開くと自動的に同一のGoogleシートと連携して立ち上がります。PCで開けばPC版（印刷・会計・全機能）、スマートフォンで開けばスマホ版としてフルアクセスで快適に共同管理できます。
                      </p>
                      <div className="flex items-center gap-1.5 pt-1">
                        <input
                          type="text"
                          readOnly
                          value={getShareInviteUrl()}
                          className="flex-1 px-2.5 py-1.5 border border-emerald-300 bg-white text-[11px] font-mono select-all text-gray-800"
                        />
                        <button
                          type="button"
                          onClick={handleCopyShareLink}
                          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer shadow-xs rounded-xs transition-colors"
                        >
                          {copiedStaffLink ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>コピー済</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>URLコピー</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#F9F7F2] px-4 py-3 border-t border-[#D1CEC7] flex items-center justify-between text-[11px] text-[#666666] shrink-0">
          <span>変更内容は安全に管理・保存されます。</span>
          <button
            onClick={onClose}
            className="px-4 py-1 bg-[#1A1A1A] text-[#D4AF37] font-bold hover:bg-[#333333] transition-colors cursor-pointer text-xs"
          >
            閉じる
          </button>
        </div>
      </div>

      {/* ==================== EXCEL IMPORT OVERWRITE CONFIRMATION POPUP ==================== */}
      {isConfirmModalOpen && pendingImportFile && (
        <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-sans animate-fade-in">
          <div className="bg-white border-2 border-rose-500 max-w-lg w-full shadow-2xl overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="bg-[#1A1A1A] text-white px-4 py-3.5 sm:px-5 sm:py-4 flex items-center justify-between border-b border-rose-500">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 bg-rose-500/20 text-rose-400 border border-rose-500/40">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white font-serif">
                    Excelデータ読み込み・上書きの確認
                  </h3>
                  <p className="text-[11px] text-gray-300">
                    既存の全登録データが置き換わります
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelImport}
                className="text-gray-400 hover:text-white p-1 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 space-y-3.5 text-xs">
              {/* High Warning Box */}
              <div className="bg-rose-50 border border-rose-200 p-3.5 sm:p-4 space-y-2 text-rose-950">
                <div className="flex items-center space-x-2 font-bold text-rose-900 text-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>既存のすべてのデータが書き換わります</span>
                </div>
                <p className="leading-relaxed text-xs text-rose-900">
                  選択したExcelファイル（<strong className="text-rose-950">{pendingImportFile.name}</strong>）を読み込むと、
                  現在システムに登録されている<strong>檀家名簿・過去帳・年回忌・法要スケジュール・出納明細・一括会計受付・ToDo・マスタ設定</strong>などの全データは、
                  <strong>本Excelファイルの内容で全て置き換わり（上書き）されます。</strong>
                </p>
                <p className="text-[11px] text-rose-800 font-medium">
                  ※ 上書き後に元のデータを取り消して復元することはできません。
                </p>
              </div>

              {/* Import Details Card */}
              <div className="bg-[#FAF8F5] border border-[#D1CEC7] p-3 space-y-2">
                <div className="grid grid-cols-3 gap-1 text-[11px]">
                  <span className="text-[#666666] font-bold">読み込みファイル:</span>
                  <span className="col-span-2 font-bold text-[#1A1A1A] break-all">
                    {pendingImportFile.name} ({((pendingImportFile.size || 0) / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[11px] border-t border-[#EBE7DF] pt-1.5">
                  <span className="text-[#666666] font-bold">取り込み対象寺院:</span>
                  <span className="col-span-2 font-bold text-[#1A1A1A]">
                    {importTargetTempleId === 'ALL'
                      ? '【全寺院】ファイル内所属をそのまま復元'
                      : `「${allTemplesList.find((t) => (t.id || 'temple-main') === importTargetTempleId)?.name || '指定寺院'}」所属として取り込み`}
                  </span>
                </div>
              </div>

              {/* Safety Backup Button */}
              {onExportExcel && (
                <div className="bg-amber-50 border border-amber-200 p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="text-[11px] text-amber-900 leading-snug">
                    <span className="font-bold">安心バックアップ：</span>
                    現在の全データを念のためExcelファイルとして保存しますか？
                  </div>
                  <button
                    type="button"
                    onClick={() => onExportExcel('ALL')}
                    className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-amber-300 text-amber-950 font-bold text-[11px] flex items-center space-x-1 shrink-0 transition-colors cursor-pointer"
                  >
                    <Download className="w-3 h-3 text-amber-700" />
                    <span>事前バックアップ保存</span>
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-[#F9F7F2] px-4 py-3 sm:px-5 sm:py-3.5 border-t border-[#D1CEC7] flex flex-col-reverse sm:flex-row items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelImport}
                className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-gray-100 border border-[#D1CEC7] text-[#1A1A1A] font-bold text-xs transition-colors cursor-pointer text-center"
              >
                キャンセル（中止）
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                className="w-full sm:w-auto px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border border-rose-900 shadow-xs text-center"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-white" />
                <span>同意して既存データを上書き読み込み</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Database Full Reset Confirmation Modal (寺院情報の初期化と同一処理) */}
      {showResetDbModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-sans animate-fade-in">
          <div className="bg-white border-2 border-rose-700 p-6 max-w-lg w-full space-y-4 shadow-2xl rounded-xs">
            <div className="flex items-center space-x-2 text-rose-800 font-bold text-base border-b border-rose-200 pb-2">
              <AlertOctagon className="w-6 h-6 text-rose-600 shrink-0" />
              <span>データベース完全初期化（全データ消去）</span>
            </div>

            <div className="bg-rose-50 border border-rose-300 p-4 space-y-2 rounded-xs text-xs text-rose-950">
              <p className="font-bold leading-relaxed flex items-center gap-1.5 text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>【最重要警告】すべてのデータが初期化されます</span>
              </p>
              <p className="text-[11px] leading-relaxed text-[#333333]">
                本システム内に保存されているすべてのデータ（<strong>本寺・兼務寺院の情報、全檀家名簿、全過去帳、全会計出納帳、全法事予約、寺院ToDo、マスタ設定等</strong>）を完全に消去し、システムを初期状態にリセットします。
              </p>
              <p className="text-[11px] leading-relaxed text-rose-700 font-bold">
                ※ この操作は取り消せません。必要なデータがある場合は、事前に「Excel出力」または「Googleスプレッドシート同期」でバックアップを保存してください。
              </p>
            </div>

            {/* Confirmation Actions */}
            <div className="flex justify-end space-x-3 pt-3 border-t border-[#E5E0D8]">
              <button
                type="button"
                onClick={() => {
                  setShowResetDbModal(false);
                  setIsResetDbAgreed(false);
                }}
                className="px-4 py-2 bg-[#F2EFE9] border border-[#D1CEC7] text-xs font-bold text-[#555555] hover:bg-[#E5E0D8] transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleExecuteResetDatabase}
                className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Database className="w-4 h-4" />
                <span>データベースを完全に初期化する</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset & Login Confirmation Modal (端末データを初期化して読込) */}
      {showResetAndLoginModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-sans animate-fade-in">
          <div className="bg-white border-2 border-rose-600 p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl rounded-xs">
            <div className="flex items-center space-x-2.5 text-rose-800 font-bold text-base border-b border-rose-200 pb-2.5">
              <div className="p-1.5 bg-rose-100 rounded-xs text-rose-700">
                <Database className="w-5 h-5" />
              </div>
              <span className="font-serif">端末データを初期化して読込</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-rose-50 border border-rose-200 p-3.5 space-y-2 rounded-xs text-rose-950">
                <p className="font-bold flex items-center gap-1.5 text-rose-900 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>端末側のデータを完全消去してGoogleシート「寺院管理・檀家過去帳データ」を取り込みます。</span>
                </p>
                <p className="text-[11px] leading-relaxed text-[#333333]">
                  この端末に保存されているデータ（端末キャッシュ、操作履歴、檀家名簿、過去帳等）を<strong>すべて消去</strong>した上で、Googleシートのデータを読み込みます。Googleシート側に端末側のデータは書き込まれません。
                </p>
              </div>

              <div className="bg-[#FAF8F5] border border-[#D1CEC7] p-3 rounded-xs space-y-1">
                <span className="font-bold text-[#1A1A1A] block text-[11px]">【主なご利用用途】</span>
                <p className="text-[11px] text-[#555555] leading-relaxed">
                  別のPCやスマートフォン等ですでに運用・登録しているGoogleシートの最新データを、この端末に完全に取り込んで利用を開始したい場合に選択してください。
                </p>
              </div>
            </div>

            {/* Confirmation Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-3 border-t border-[#E5E0D8]">
              <button
                type="button"
                onClick={() => setShowResetAndLoginModal(false)}
                className="w-full sm:w-auto px-4 py-2 bg-[#F2EFE9] border border-[#D1CEC7] text-xs font-bold text-[#555555] hover:bg-[#E5E0D8] transition-colors cursor-pointer text-center"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleExecuteResetAndLogin}
                className="w-full sm:w-auto px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold flex items-center justify-center space-x-1.5 shadow-xs transition-colors cursor-pointer border border-rose-900 text-center"
              >
                <Database className="w-4 h-4" />
                <span>端末データを初期化して読込</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Write to Google Sheets Confirmation Modal (Googleシートを初期化して書込) */}
      {showCleanWriteModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-sans animate-fade-in">
          <div className="bg-white border-2 border-sky-600 p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl rounded-xs">
            <div className="flex items-center space-x-2.5 text-sky-900 font-bold text-base border-b border-sky-200 pb-2.5">
              <div className="p-1.5 bg-sky-100 rounded-xs text-sky-700">
                <UploadCloud className="w-5 h-5" />
              </div>
              <span className="font-serif">Googleシートを初期化して書込</span>
            </div>

            <div className="space-y-3 text-xs">
              {/* 警告表示 */}
              <div className="bg-amber-50 border-2 border-amber-500 p-3.5 space-y-2 rounded-xs text-amber-950 shadow-xs">
                <p className="font-bold flex items-start gap-1.5 text-amber-900 text-xs leading-snug">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>書込中に不具合があった場合は大切なデータが失われますので、この操作を行う時はGoogleシートのバックアップを推奨します</span>
                </p>
                <p className="text-[11px] leading-relaxed text-[#444444]">
                  Googleドライブ上の既存の「寺院管理・檀家過去帳データ」ファイルを<strong>完全に消去</strong>した上で、新たに「寺院管理・檀家過去帳データ」スプレッドシートを新規作成し、現在この端末にある最新データ（檀家名簿・過去帳・法事予約・出納帳・マスタ設定等）を全件書き込みます。
                </p>
              </div>

              <div className="bg-[#FAF8F5] border border-[#D1CEC7] p-3 rounded-xs space-y-1">
                <span className="font-bold text-[#1A1A1A] block text-[11px]">【主なご利用用途】</span>
                <p className="text-[11px] text-[#555555] leading-relaxed">
                  端末側で整理・編集した最新データを、Googleシート側に反映してクラウドのデータを完全に一新したい場合に選択してください。
                </p>
              </div>
            </div>

            {/* Confirmation Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-3 border-t border-[#E5E0D8]">
              <button
                type="button"
                onClick={() => setShowCleanWriteModal(false)}
                className="w-full sm:w-auto px-4 py-2 bg-[#F2EFE9] border border-[#D1CEC7] text-xs font-bold text-[#555555] hover:bg-[#E5E0D8] transition-colors cursor-pointer text-center"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleExecuteCleanWriteToSheets}
                className="w-full sm:w-auto px-5 py-2 bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold flex items-center justify-center space-x-1.5 shadow-xs transition-colors cursor-pointer border border-sky-900 text-center"
              >
                <UploadCloud className="w-4 h-4" />
                <span>書込</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tutorial Data Conflict Warning Modal (チュートリアルデータ混入警告) */}
      {showTutorialWarningModal && (
        <div className="fixed inset-0 z-70 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-sans animate-fade-in">
          <div className="bg-white border-2 border-amber-600 p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl rounded-xs">
            <div className="flex items-center space-x-2.5 text-amber-900 font-bold text-base border-b border-amber-200 pb-2.5">
              <div className="p-1.5 bg-amber-100 rounded-xs text-amber-700">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <span className="font-serif">チュートリアルデータ混入警告</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-amber-50 border-2 border-amber-400 p-4 space-y-2 rounded-xs text-amber-950 shadow-xs">
                <p className="font-bold text-amber-950 text-sm leading-relaxed">
                  Googleシートにチュートリアルデータが混入する可能性があります。端末データを初期化してGoogleシートを読み込みますか
                </p>
                <p className="text-[11px] leading-relaxed text-[#555555] pt-1 border-t border-amber-200/80">
                  端末内にサンプルの寺院情報、またはチュートリアル用の檀家レコード（DA/D1）が残っていることが検出されました。<br />
                  「OK」を押すと、端末側のデータを初期化した上でGoogleシートの正規データを安全に取り込みます。
                </p>
              </div>
            </div>

            {/* Confirmation Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-3 border-t border-[#E5E0D8]">
              <button
                type="button"
                onClick={() => setShowTutorialWarningModal(false)}
                className="w-full sm:w-auto px-4 py-2 bg-[#F2EFE9] border border-[#D1CEC7] text-xs font-bold text-[#555555] hover:bg-[#E5E0D8] transition-colors cursor-pointer text-center"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTutorialWarningModal(false);
                  handleExecuteResetAndLogin();
                }}
                className="w-full sm:w-auto px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center space-x-1.5 shadow-xs transition-colors cursor-pointer border border-amber-800 text-center"
              >
                <Check className="w-4 h-4" />
                <span>OK</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Mode Disconnect Choice Modal (共有モード専用：選択肢①または選択肢②のみ) */}
      {showSharedDisconnectChoiceModal && (
        <div className="fixed inset-0 z-70 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-sans animate-fade-in">
          <div className="bg-white border-2 border-[#D4AF37] p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl rounded-xs">
            <div className="flex items-center space-x-2.5 text-[#1A1A1A] font-bold text-base border-b border-[#D4AF37]/50 pb-2.5">
              <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-xs">
                <RefreshCw className="w-5 h-5" />
              </div>
              <span className="font-serif">共有データの連携操作の選択</span>
            </div>

            <p className="text-xs text-[#555555] leading-relaxed">
              現在、共有スプレッドシートのデータに接続しています。実行したい操作を選択してください（個人のGoogleドライブとの混同や新規シート作成は行われません）。
            </p>

            <div className="space-y-3 pt-1">
              {/* 選択肢①: 共有データと再接続 */}
              <div className="bg-emerald-50/80 border-2 border-emerald-500 p-3.5 space-y-2 rounded-xs">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-emerald-950 text-xs sm:text-sm flex items-center gap-1.5">
                    <span>選択肢①: 共有データと再接続</span>
                    <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.2 rounded-xs font-normal">共有シートに再接続</span>
                  </div>
                </div>
                <p className="text-[11px] text-emerald-900/90 leading-relaxed">
                  指定された共有スプレッドシートに再接続し、最新の共同管理データを同期して作業を継続します。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowSharedDisconnectChoiceModal(false);
                    handleReconnectSharedSheet();
                  }}
                  disabled={loading}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-xs transition-colors cursor-pointer rounded-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>「共有データと再接続」を実行</span>
                </button>
              </div>

              {/* 選択肢②: 連携を中止して初期状態に戻る */}
              <div className="bg-[#FAF9F5] border border-gray-400 p-3.5 space-y-2 rounded-xs">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-gray-900 text-xs sm:text-sm flex items-center gap-1.5">
                    <span>選択肢②: 連携を中止して初期状態に戻る</span>
                    <span className="text-[10px] bg-gray-600 text-white px-1.5 py-0.2 rounded-xs font-normal">ブラウザ更新・初期化</span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  共有データとの接続を終了し、端末内の一時キャッシュを消去して初期起動画面（PC読込・通常連携・新規立ち上げ等）に戻ります。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowSharedDisconnectChoiceModal(false);
                    handleConfirmResetToInitialStartup();
                  }}
                  disabled={loading}
                  className="w-full py-2 px-3 bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-800 border border-gray-400 font-bold text-xs flex items-center justify-center space-x-1.5 shadow-xs transition-colors cursor-pointer rounded-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-gray-600" />
                  <span>「連携を中止して初期状態に戻る」を実行</span>
                </button>
              </div>
            </div>

            {/* Cancel / Close Action */}
            <div className="flex justify-end pt-2 border-t border-[#E5E0D8]">
              <button
                type="button"
                onClick={() => setShowSharedDisconnectChoiceModal(false)}
                className="px-4 py-1.5 bg-[#F2EFE9] border border-[#D1CEC7] text-xs font-bold text-[#555555] hover:bg-[#E5E0D8] transition-colors cursor-pointer text-center"
              >
                キャンセル（閉じる）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
