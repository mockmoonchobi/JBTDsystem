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
  UploadCloud
} from 'lucide-react';
import { User } from 'firebase/auth';
import { googleSignIn, logout, initAuth, getAccessToken, getCurrentUser } from '../lib/googleAuth';
import { 
  findOrCreateSpreadsheet, 
  getSpreadsheetPermissions, 
  shareSpreadsheetWithUser, 
  removeSpreadsheetPermission, 
  updateSpreadsheetPermissionRole, 
  setSpreadsheetLinkSharing, 
  validateAndConnectSpreadsheet,
  SheetPermission 
} from '../lib/googleSheets';
import { TempleProfile } from '../types';
import { safeStorage, loadJsonState, saveJsonState } from '../utils/storageUtils';

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
  onDisconnect?: () => void | Promise<void>;
  onExportExcel?: (targetTempleId?: string | 'ALL') => void;
  onImportExcel?: (file: File, targetTempleId?: string | 'ALL') => Promise<{ success: boolean; message: string } | void> | void;
  onOpenImportModal?: () => void;
  onRestoreBackup?: () => Promise<{ success: boolean; message: string }>;
  onResetDatabase?: () => void | Promise<void>;
  temples?: TempleProfile[];
  activeTempleId?: string;
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
  onDisconnect,
  onExportExcel,
  onImportExcel,
  onOpenImportModal,
  onRestoreBackup,
  onResetDatabase,
  temples = [],
  activeTempleId = 'temple-main',
}) => {
  const [activeTab, setActiveTab] = useState<'excel' | 'sheets'>('excel');
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

  // Custom Shared Sheet Connect State
  const [showCustomSheetConnect, setShowCustomSheetConnect] = useState<boolean>(false);
  const [customSheetInput, setCustomSheetInput] = useState<string>('');
  const [isConnectingCustomSheet, setIsConnectingCustomSheet] = useState<boolean>(false);

  // Database Reset State (寺院情報の初期化と同等)
  const [showResetDbModal, setShowResetDbModal] = useState<boolean>(false);
  const [isResetDbAgreed, setIsResetDbAgreed] = useState<boolean>(false);
  const [showResetAndLoginModal, setShowResetAndLoginModal] = useState<boolean>(false);
  const [showCleanWriteModal, setShowCleanWriteModal] = useState<boolean>(false);

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
    if (isOpen && activeTab === 'sheets' && user && spreadsheetInfo?.id) {
      loadPermissions(spreadsheetInfo.id);
    }
  }, [isOpen, activeTab, user, spreadsheetInfo?.id]);

  if (!isOpen) return null;

  // Handle Google Login & Setup Auto-Sync
  const handleLogin = async (isCleanImport: boolean = false) => {
    const clean = typeof isCleanImport === 'boolean' ? isCleanImport : false;
    setLoading(true);
    setStatusMessage({ type: 'loading', text: 'Googleアカウント認証中...' });
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setStatusMessage({ type: 'loading', text: 'GoogleDrive上のデータを確認・連携中...' });

        // Auto-detect or create Google Sheet
        const sheet = await findOrCreateSpreadsheet(res.accessToken, false, {
          preferredSheetId: spreadsheetInfo?.id,
          onProgress: (text) => setStatusMessage({ type: 'loading', text }),
        });
        setSpreadsheetInfo(sheet);
        saveJsonState('temple_google_sheet_info', sheet);
        
        // Load permissions
        loadPermissions(sheet.id);

        if (onSyncWithGoogleDrive) {
          const syncRes = await onSyncWithGoogleDrive(res.accessToken, sheet.id, clean);
          setStatusMessage({ 
            type: 'success', 
            text: `ログイン成功: ${res.user.email} (GoogleDriveデータ連携完了: ${syncRes?.count ?? 0}件)` 
          });
        } else {
          // Trigger initial sync after login
          setTimeout(() => {
            onTriggerManualSync();
          }, 500);
        }
      }
    } catch (err: any) {
      console.error(err);
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
    setStatusMessage({ type: 'loading', text: '端末データを初期化中...' });
    try {
      if (onResetDatabase) {
        await onResetDatabase();
      }
      // 初期化後にGoogleアカウント認証・初期化読込を開始
      await handleLogin(true /* isCleanImport */);
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `読込エラー: ${err.message || '初期化読込に失敗しました。'}` });
      setLoading(false);
    }
  };

  // Googleシートを初期化して書込 (GoogleDrive上の既存ファイルを完全消去し、新規ファイルを作成して端末データを書込)
  const handleExecuteCleanWriteToSheets = async () => {
    setShowCleanWriteModal(false);
    setLoading(true);
    setStatusMessage({ type: 'loading', text: 'Googleアカウント認証・連携準備中...' });
    try {
      let token = await getAccessToken();
      let currentUser = getCurrentUser();
      if (!token || !currentUser) {
        const res = await googleSignIn();
        if (!res) throw new Error('Googleログインがキャンセルされました。');
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
      console.error(err);
      setStatusMessage({ type: 'error', text: `書込エラー: ${err.message || 'Googleシートへの初期化書き込みに失敗しました。'}` });
    } finally {
      setLoading(false);
    }
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

      await shareSpreadsheetWithUser(
        token,
        spreadsheetInfo.id,
        shareEmail.trim(),
        shareRole,
        shareSendNotification
      );

      setStatusMessage({ 
        type: 'success', 
        text: `「${shareEmail.trim()}」に${shareRole === 'writer' ? '編集' : '閲覧'}権限を共有しました。` 
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

  // Handle toggling link sharing
  const handleToggleLinkSharing = async (enable: boolean, targetRole: 'writer' | 'reader' = 'reader') => {
    if (!spreadsheetInfo?.id) return;
    const anyonePerm = permissions.find((p) => p.type === 'anyone');

    setStatusMessage({ type: 'loading', text: enable ? 'リンク共有を有効化中...' : 'リンク共有を無効化中...' });
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('認証トークンが見つかりません。');

      await setSpreadsheetLinkSharing(token, spreadsheetInfo.id, enable, targetRole, anyonePerm?.id);
      setStatusMessage({ 
        type: 'success', 
        text: enable 
          ? `リンク共有を有効化しました（${targetRole === 'writer' ? 'リンクを知っている全員が編集可' : 'リンクを知っている全員が閲覧可'}）。` 
          : 'リンク共有を解除（非公開）にしました。' 
      });
      await loadPermissions(spreadsheetInfo.id);
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `リンク共有設定エラー: ${err.message || '設定に失敗しました。'}` });
    }
  };

  // Copy Sheet Link
  const handleCopyLink = () => {
    if (!spreadsheetInfo?.url) return;
    navigator.clipboard.writeText(spreadsheetInfo.url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Connect to another custom / shared spreadsheet ID
  const handleConnectCustomSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSheetInput.trim()) return;

    const confirmConnect = window.confirm(
      '他の寺院関係者から共有されたスプレッドシートに切り替えて接続します。\n\n' +
      '※ 端末上の現在のデータを初期化（リセット）してから、共有スプレッドシートの全データを新しく読み込みます。\n' +
      '（接続前の端末データは自動で安全にバックアップ保存されます）\n\n' +
      '接続と端末データ初期化・読込を実行しますか？'
    );
    if (!confirmConnect) return;

    setIsConnectingCustomSheet(true);
    setStatusMessage({ type: 'loading', text: '指定された共有スプレッドシートを検証・接続中...' });
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('認証トークンが見つかりません。再ログインしてください。');

      const connected = await validateAndConnectSpreadsheet(token, customSheetInput.trim());
      setSpreadsheetInfo(connected);
      saveJsonState('temple_google_sheet_info', connected);

      setStatusMessage({ 
        type: 'success', 
        text: `共有スプレッドシート「${connected.title}」と接続しました。端末データを初期化して最新データを読み込みます...` 
      });
      setCustomSheetInput('');
      setShowCustomSheetConnect(false);

      await loadPermissions(connected.id);
      if (onSyncWithGoogleDrive) {
        await onSyncWithGoogleDrive(token, connected.id, true /* isCleanImport */);
      } else {
        setTimeout(() => {
          onTriggerManualSync();
        }, 500);
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `接続エラー: ${err.message || 'スプレッドシートの接続に失敗しました。'}` });
    } finally {
      setIsConnectingCustomSheet(false);
    }
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
              <h2 className="text-base sm:text-lg font-bold font-serif text-[#F9F7F2] flex items-center gap-1.5">
                データ連携・Excel / Googleシート管理
              </h2>
              <p className="text-[11px] text-[#CCCCCC] font-sans">
                全寺院一括 ＆ 各寺院個別 Excel入出力・Googleスプレッドシート自動同期
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

        {/* Tab Switcher */}
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
            <Zap className={`w-4 h-4 ${syncStatus === 'synced' ? 'text-emerald-600' : 'text-[#888888]'}`} />
            <span>② Googleシート常時自動同期</span>
            {syncStatus === 'synced' && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
        </div>

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
          {activeTab === 'excel' && (
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
                      ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-500'
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
              <div className="bg-[#F9F7F2] border border-[#D1CEC7] p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between border-b border-[#EBE7DF] pb-1.5">
                  <span className="font-bold text-[#666666] uppercase tracking-wider">連携Googleアカウント</span>
                  {user && (
                    <button
                      onClick={handleLogout}
                      className="px-2 py-0.5 bg-white hover:bg-gray-100 border border-[#D1CEC7] text-gray-700 font-bold text-[11px] flex items-center space-x-1 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>連携解除</span>
                    </button>
                  )}
                </div>

                {user ? (
                  <div className="flex items-center space-x-3 pt-0.5">
                    <div className="w-7 h-7 rounded-full bg-emerald-800 text-emerald-100 flex items-center justify-center font-bold text-xs">
                      {user.displayName ? user.displayName.charAt(0) : 'G'}
                    </div>
                    <div className="overflow-hidden">
                      <div className="font-bold text-[#1A1A1A] truncate">{user.displayName || 'Google Account'}</div>
                      <div className="text-[#666666] font-mono text-[10px] truncate">{user.email}</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    <p className="text-[11px] text-[#555555] leading-relaxed">
                      Googleアカウントと連携すると、スプレッドシートとのリアルタイム自動同期・バックアップが行えます。連携方法を選択してください。
                    </p>

                    <div className="space-y-3">
                      {/* 1. Googleシートと連携 */}
                      <div className="bg-[#FAF9F5] border border-[#D4AF37]/60 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs rounded-xs">
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
                          onClick={() => handleLogin(false)}
                          disabled={loading}
                          className="w-full sm:w-auto sm:min-w-[210px] py-2.5 px-4 bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-50 text-[#D4AF37] font-bold text-xs flex items-center justify-center space-x-2 transition-colors border border-[#D4AF37]/50 cursor-pointer shadow-xs rounded-xs whitespace-nowrap shrink-0"
                          title="現在の端末データを保持してGoogleアカウントと自動同期を開始します"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>Googleシートと連携</span>
                        </button>
                      </div>

                      {/* 2. 端末データを初期化して読込 */}
                      <div className="bg-rose-50/40 border border-rose-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs rounded-xs">
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
                      <div className="bg-sky-50/40 border border-sky-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs rounded-xs">
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
                          onClick={() => {
                            setShowCleanWriteModal(true);
                          }}
                          disabled={loading}
                          className="w-full sm:w-auto sm:min-w-[210px] py-2.5 px-4 bg-sky-50 hover:bg-sky-100 disabled:opacity-50 text-sky-800 border border-sky-300 font-bold text-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer shadow-xs rounded-xs whitespace-nowrap shrink-0"
                          title="Googleシートのデータを完全消去して端末側のデータを「寺院管理・檀家過去帳データ」に書き込みます"
                        >
                          <UploadCloud className="w-3.5 h-3.5 text-sky-600" />
                          <span>Googleシートを初期化して書込</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Connected Sheet Details */}
                {user && spreadsheetInfo && (
                  <div className="pt-2 border-t border-[#EBE7DF] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#666666]">同期先スプレッドシート</span>
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
                        <div className="font-bold text-[#1A1A1A] truncate text-xs">寺院管理・檀家過去帳データ</div>
                        <div className="text-[9px] text-[#888888] font-mono truncate">ID: {spreadsheetInfo.id}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ==================== GOOGLE SHEET SHARING & COLLABORATION SECTION ==================== */}
              {user && spreadsheetInfo && (
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

                  {/* Public Link Sharing Toggle */}
                  <div className="bg-[#FAF8F5] border border-[#E5E0D8] p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <div className={`p-1 border ${permissions.some(p => p.type === 'anyone') ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-gray-100 border-gray-300 text-gray-500'}`}>
                        <Globe className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-[#1A1A1A] flex items-center space-x-1.5">
                          <span>リンクを知っている全員への共有</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 border ${
                            permissions.some(p => p.type === 'anyone')
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-gray-200 text-gray-600 border-gray-300'
                          }`}>
                            {permissions.some(p => p.type === 'anyone') ? (permissions.find(p => p.type === 'anyone')?.role === 'writer' ? 'リンク編集可' : 'リンク閲覧可') : '非公開（制限付き）'}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#666666]">
                          {permissions.some(p => p.type === 'anyone')
                            ? 'URLを知っているユーザーなら誰でもアクセスできます。' 
                            : '招待されたアカウントのみアクセス可能です。'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {permissions.some(p => p.type === 'anyone') ? (
                        <button
                          type="button"
                          onClick={() => handleToggleLinkSharing(false)}
                          className="px-2 py-1 bg-white hover:bg-gray-100 border border-[#D1CEC7] text-rose-700 font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          リンク共有を解除
                        </button>
                      ) : (
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleToggleLinkSharing(true, 'reader')}
                            className="px-2 py-1 bg-white hover:bg-gray-100 border border-[#D1CEC7] text-[#1A1A1A] font-bold text-[11px] transition-colors cursor-pointer"
                          >
                            閲覧リンク作成
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleLinkSharing(true, 'writer')}
                            className="px-2 py-1 bg-[#1A1A1A] hover:bg-[#333333] text-[#D4AF37] font-bold text-[11px] transition-colors cursor-pointer"
                          >
                            編集リンク作成
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

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
                                    <span>{isAnyone ? 'リンクを知っている全員' : (perm.displayName || perm.emailAddress || 'ユーザー')}</span>
                                    {isCurrentUser && (
                                      <span className="text-[9px] bg-amber-100 text-amber-900 px-1 font-normal border border-amber-300">
                                        あなた
                                      </span>
                                    )}
                                  </div>
                                  {!isAnyone && perm.emailAddress && (
                                    <div className="text-[10px] text-[#666666] font-mono truncate">{perm.emailAddress}</div>
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
                                      onClick={() => handleRemovePermission(perm.id, perm.displayName || perm.emailAddress || '')}
                                      className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition-colors cursor-pointer rounded-xs"
                                      title="共有を解除"
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

                  {/* Connect to Existing Shared Spreadsheet (Accordion) */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCustomSheetConnect(!showCustomSheetConnect)}
                      className="w-full py-1.5 px-2 bg-[#FAF8F5] hover:bg-[#F2EFE9] border border-[#D1CEC7] text-left text-[11px] font-bold text-gray-700 flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <span className="flex items-center space-x-1.5">
                        <Link className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>他の寺院関係者から共有されたスプレッドシートに切り替える</span>
                      </span>
                      {showCustomSheetConnect ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {showCustomSheetConnect && (
                      <form onSubmit={handleConnectCustomSheet} className="mt-2 p-3 bg-white border border-[#D1CEC7] space-y-2 text-xs animate-in fade-in">
                        <p className="text-[10px] text-[#555555]">
                          副住職様や他の管理者様が作成し、あなたのアカウントに共有されたGoogleスプレッドシートのURLまたはIDを入力して同期先を切り替えることができます。
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={customSheetInput}
                            onChange={(e) => setCustomSheetInput(e.target.value)}
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            required
                            className="flex-1 px-2.5 py-1.5 border border-[#D1CEC7] bg-white text-xs font-mono focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={isConnectingCustomSheet || !customSheetInput.trim()}
                            className="px-3 py-1.5 bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-50 text-[#D4AF37] font-bold text-xs transition-colors border border-[#D4AF37]/50 cursor-pointer shrink-0"
                          >
                            {isConnectingCustomSheet ? '検証中...' : '接続して同期'}
                          </button>
                        </div>
                      </form>
                    )}
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
                  この端末に保存されているデータ（初期ダミーデータ、檀家名簿、過去帳等）を<strong>一旦すべて消去して空の状態</strong>にした上で、Googleアカウントにログインし、Googleシート「寺院管理・檀家過去帳データ」を取り込みます。
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
              <div className="bg-sky-50 border border-sky-200 p-3.5 space-y-2 rounded-xs text-sky-950">
                <p className="font-bold flex items-center gap-1.5 text-sky-900 text-xs">
                  <AlertTriangle className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>Googleドライブ上の既存ファイルを消去し、新たにファイルを作成して端末データを書き込みます。</span>
                </p>
                <p className="text-[11px] leading-relaxed text-[#333333]">
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
                <span>Googleシートを初期化して書込</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
