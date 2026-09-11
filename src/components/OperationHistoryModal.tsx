import React, { useState, useMemo } from 'react';
import { 
  X, 
  History, 
  RefreshCw, 
  ExternalLink, 
  Search, 
  Filter, 
  PlusCircle, 
  Edit3, 
  Trash2, 
  Database, 
  CheckCircle2, 
  Smartphone, 
  Monitor, 
  User as UserIcon,
  Clock,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { DeletedRecordEntry } from '../types';
import { getCurrentUser } from '../lib/googleAuth';
import { safeStorage } from '../utils/storageUtils';

interface OperationHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  deletedRecords: DeletedRecordEntry[];
  onTriggerManualSync?: () => void;
  isSyncing?: boolean;
  spreadsheetUrl?: string | null;
  isGoogleConnected?: boolean;
}

interface ParsedOperation {
  headline: string;
  subHeadline: string;
  chips: string[];
  recordId?: string;
}

/**
 * Parses operation entry into a clear, human-readable headline, action summary, and detailed metadata chips.
 */
export function parseOperationDetails(entry: DeletedRecordEntry): ParsedOperation {
  const rawLabel = (entry.label || '').trim();
  const rawId = (entry.id || '').trim();
  const actionType = entry.actionType || 'delete';
  const entityType = entry.entityType || 'household';

  const getActionPhrase = (act: string, ent: string): string => {
    const isCreate = act === 'create' || act === 'batch_create';
    const isUpdate = act === 'update' || act === 'undo';

    switch (ent) {
      case 'household':
        return isCreate ? '世帯台帳の新規登録' : (isUpdate ? '世帯情報の更新・変更' : '世帯台帳の削除');
      case 'familyMember':
        return isCreate ? '世帯家族の追加登録' : (isUpdate ? '家族構成員の更新' : '家族構成員の削除');
      case 'pastRecord':
        return isCreate ? '過去帳（故人精霊）の新規登録' : (isUpdate ? '過去帳（命日・施主情報等）の更新' : '過去帳レコードの削除');
      case 'memorialService':
        return isCreate ? '法要予約の新規受付' : (isUpdate ? '法要予約内容の変更' : '法要予約の取り消し・削除');
      case 'transaction':
        return isCreate ? '出納帳（入出金）の新規記帳' : (isUpdate ? '出納帳レコードの修正' : '出納レコードの削除');
      case 'templeTodo':
        return isCreate ? '寺院ToDoタスクの追加' : (isUpdate ? '寺院ToDoタスクの更新' : '寺院ToDoタスクの削除');
      case 'priest':
        return '登録僧侶名簿の更新保存';
      case 'temple':
        return '寺院基本情報・兼務寺院設定の更新';
      case 'disasterMemorial':
        return isCreate ? '戦没・災害物故者命日設定の登録' : (isUpdate ? '戦没・災害物故者命日設定の更新' : '戦没・災害物故者命日設定の削除');
      case 'noticeTemplate':
        return '案内文テンプレートの設定保存';
      case 'master':
        return 'マスタ設定（区分・勘定科目）の変更';
      case 'batchAccounting':
        return '一括会計受付データの更新';
      default:
        return isCreate ? '新規登録' : (isUpdate ? '変更・更新' : '削除');
    }
  };

  let headline = '';
  let subHeadline = '';
  const chips: string[] = [];

  if (rawLabel) {
    // 1. Structured format: "操作種別名：対象名（詳細情報）"
    const colonIdx = rawLabel.indexOf('：') !== -1 ? rawLabel.indexOf('：') : rawLabel.indexOf(': ');
    if (colonIdx > 0 && colonIdx < 35) {
      subHeadline = rawLabel.substring(0, colonIdx).trim();
      let rest = rawLabel.substring(colonIdx + (rawLabel.charAt(colonIdx) === '：' ? 1 : 2)).trim();

      // Extract parentheses at the end if present: （...） or (...)
      const parenMatch = rest.match(/([（(])([^）)]+)([）)])$/);
      if (parenMatch) {
        const inside = parenMatch[2].trim();
        rest = rest.substring(0, parenMatch.index).trim();
        const parts = inside.split(/\s*[/／、]\s*/).filter(Boolean);
        chips.push(...parts);
      }
      headline = rest;
    } else {
      // 2. Pattern with Japanese quotes: e.g. 世帯「佐藤 太郎」を更新 / 世帯「佐藤 太郎」
      const fullQuoteMatch = rawLabel.match(/^(.+?)「(.+?)」を?(追加|更新|削除|変更)?$/);
      if (fullQuoteMatch) {
        headline = fullQuoteMatch[2].trim();
        const actionVerb = fullQuoteMatch[3];
        if (actionVerb) {
          const act = actionVerb === '追加' ? 'create' : (actionVerb === '削除' ? 'delete' : 'update');
          subHeadline = getActionPhrase(act, entityType);
        } else {
          subHeadline = getActionPhrase(actionType, entityType);
        }
      } else {
        headline = rawLabel;
        subHeadline = getActionPhrase(actionType, entityType);
      }
    }
  } else {
    headline = rawId || '対象名称未設定';
    subHeadline = getActionPhrase(actionType, entityType);
  }

  // Fallback if headline is empty
  if (!headline) {
    headline = rawId ? `管理番号: ${rawId}` : '対象未指定';
  }

  // Household naming polish
  if (entityType === 'household' && !headline.endsWith('様') && !headline.includes('世帯') && !headline.startsWith('ID:')) {
    headline = `${headline} 様`;
  }

  const recordId = rawId && !rawId.startsWith('LOG-') ? rawId : undefined;

  return {
    headline,
    subHeadline: subHeadline || getActionPhrase(actionType, entityType),
    chips,
    recordId,
  };
}

export const OperationHistoryModal: React.FC<OperationHistoryModalProps> = ({
  isOpen,
  onClose,
  deletedRecords,
  onTriggerManualSync,
  isSyncing = false,
  spreadsheetUrl,
  isGoogleConnected = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedEntity, setSelectedEntity] = useState<string>('all');

  // Stats calculation
  const stats = useMemo(() => {
    let creates = 0;
    let updates = 0;
    let deletes = 0;

    deletedRecords.forEach((r) => {
      if (r.actionType === 'create' || r.actionType === 'batch_create') creates++;
      else if (r.actionType === 'update' || r.actionType === 'undo') updates++;
      else deletes++;
    });

    return { total: deletedRecords.length, creates, updates, deletes };
  }, [deletedRecords]);

  // 操作者のGoogleアカウント名を表示（旧「管理者」や未設定の場合は現在のGoogleアカウントまたは未連携と表記）
  const currentUser = getCurrentUser();
  const getDisplayOperatorName = (operator?: string, deviceInfo?: string) => {
    const clean = (operator || '').trim();
    if (!clean || clean === '管理者' || clean === '寺院関係者') {
      const activeGoogle = currentUser?.displayName || currentUser?.email || (typeof window !== 'undefined' ? (safeStorage.getItem('renge_google_user_name') || safeStorage.getItem('renge_google_user_email')) : '');
      return activeGoogle || 'Google未連携';
    }
    return clean;
  };

  // Filtered entries
  const filteredRecords = useMemo(() => {
    return deletedRecords.filter((r) => {
      // Action filter
      if (selectedAction === 'create' && !(r.actionType === 'create' || r.actionType === 'batch_create')) return false;
      if (selectedAction === 'update' && !(r.actionType === 'update' || r.actionType === 'undo')) return false;
      if (selectedAction === 'delete' && !(r.actionType === 'delete' || r.actionType === 'batch_delete' || r.actionType === 'wipe')) return false;

      // Entity filter
      if (selectedEntity !== 'all' && r.entityType !== selectedEntity) return false;

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const displayOp = getDisplayOperatorName(r.operator, r.deviceInfo).toLowerCase();
        const rawOp = (r.operator || '').toLowerCase();
        const matchLabel = (r.label || '').toLowerCase().includes(term);
        const matchId = (r.id || '').toLowerCase().includes(term);
        const matchEntity = getEntityLabel(r.entityType).toLowerCase().includes(term);
        const matchOperator = displayOp.includes(term) || rawOp.includes(term);
        const matchDevice = (r.deviceInfo || '').toLowerCase().includes(term);
        if (!matchLabel && !matchId && !matchEntity && !matchOperator && !matchDevice) {
          return false;
        }
      }

      return true;
    });
  }, [deletedRecords, selectedAction, selectedEntity, searchTerm, currentUser]);

  if (!isOpen) return null;

  const getEntityLabel = (entityType: string) => {
    switch (entityType) {
      case 'household': return '檀家・世帯';
      case 'familyMember': return '家族構成';
      case 'pastRecord': return '過去帳・故人';
      case 'memorialService': return '法要予約';
      case 'templeTodo': return '寺院ToDo';
      case 'transaction': return '出納・会計';
      case 'priest': return '登録僧侶';
      case 'temple': return '寺院設定';
      case 'disasterMemorial': return '戦没・災害物故者';
      case 'noticeTemplate': return '案内文テンプレート';
      case 'master': return '区分・科目マスタ';
      case 'batchAccounting': return '一括会計受付';
      default: return entityType;
    }
  };

  const getActionBadge = (actionType?: string) => {
    switch (actionType) {
      case 'create':
      case 'batch_create':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <PlusCircle className="w-3.5 h-3.5" />
            新規登録
          </span>
        );
      case 'update':
      case 'undo':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <Edit3 className="w-3.5 h-3.5" />
            変更・更新
          </span>
        );
      case 'delete':
      case 'batch_delete':
      case 'wipe':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
            <Trash2 className="w-3.5 h-3.5" />
            削除
          </span>
        );
    }
  };

  const formatDate = (isoOrTs: string | number) => {
    if (!isoOrTs) return '-';
    try {
      const d = new Date(isoOrTs);
      if (isNaN(d.getTime())) return String(isoOrTs);
      return d.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return String(isoOrTs);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#FAF9F5] rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-[#E5E0D8]">
        
        {/* Header */}
        <div className="bg-[#1C2536] text-[#F9F7F2] p-4 sm:p-5 flex items-center justify-between border-b border-[#2C384E] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-300 rounded-xl border border-blue-400/30">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                操作・削除履歴（Googleシート連携ログ）
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Googleスプレッドシートの「操作・削除履歴」シートと双方向リアルタイム同期中
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sync Status Banner */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 sm:px-6 py-3 border-b border-blue-100 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-slate-700">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isGoogleConnected ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isGoogleConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            </span>
            <span className="font-medium text-slate-800">
              {isGoogleConnected ? 'Googleスプレッドシート接続済み' : 'Google連携オフライン（ローカル記録中）'}
            </span>
            <span className="text-slate-500 hidden sm:inline">
              — 新規登録・変更更新・削除操作が全て記録され、他端末とも自動同期されます
            </span>
          </div>
          
          <div className="flex items-center gap-2 ml-auto">
            {spreadsheetUrl && (
              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-blue-600 font-medium text-xs shadow-sm transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                スプレッドシートで確認
              </a>
            )}
            {onTriggerManualSync && isGoogleConnected && (
              <button
                onClick={onTriggerManualSync}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? '同期中...' : '今すぐ同期'}
              </button>
            )}
          </div>
        </div>

        {/* Stats & Filter Bar */}
        <div className="p-4 sm:p-5 border-b border-[#E5E0D8] bg-white space-y-3 shrink-0">
          {/* Stats Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => setSelectedAction('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                selectedAction === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              全履歴: <strong className="ml-1">{stats.total}</strong> 件
            </button>
            <button
              onClick={() => setSelectedAction('create')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                selectedAction === 'create'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              新規登録: <strong className="ml-1">{stats.creates}</strong> 件
            </button>
            <button
              onClick={() => setSelectedAction('update')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                selectedAction === 'update'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
              }`}
            >
              変更・更新: <strong className="ml-1">{stats.updates}</strong> 件
            </button>
            <button
              onClick={() => setSelectedAction('delete')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                selectedAction === 'delete'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              削除: <strong className="ml-1">{stats.deletes}</strong> 件
            </button>
          </div>

          {/* Search & Entity Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="操作内容、対象名、操作者、端末等で検索..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedEntity}
                onChange={(e) => setSelectedEntity(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 text-slate-700"
              >
                <option value="all">すべてのデータ対象</option>
                <option value="household">檀家・世帯</option>
                <option value="pastRecord">過去帳・故人</option>
                <option value="memorialService">法要予約</option>
                <option value="templeTodo">寺院ToDo</option>
                <option value="transaction">出納・会計</option>
                <option value="familyMember">家族構成</option>
                <option value="priest">登録僧侶</option>
                <option value="temple">寺院設定</option>
                <option value="disasterMemorial">戦没・災害物故者設定</option>
                <option value="noticeTemplate">案内文テンプレート</option>
                <option value="master">区分・科目マスタ</option>
                <option value="batchAccounting">一括会計</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {filteredRecords.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-dashed border-slate-200 text-slate-500 space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-slate-400" />
              <p className="font-medium text-slate-700">表示できる操作履歴がありません</p>
              <p className="text-xs text-slate-400">
                {searchTerm || selectedAction !== 'all' || selectedEntity !== 'all'
                  ? '絞り込み条件に一致する履歴が見つかりませんでした。'
                  : '世帯の新規登録や編集、削除などの操作を行うと、ここに履歴が自動記録されGoogleスプレッドシートへ同期されます。'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-3.5 whitespace-nowrap">操作種別</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">データ対象</th>
                      <th className="py-3 px-3.5 min-w-[280px]">操作内容 / 詳細</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">操作日時</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">操作者</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">端末</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredRecords.map((entry, idx) => {
                      const parsed = parseOperationDetails(entry);
                      return (
                        <tr key={entry.logId || `${entry.id}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            {getActionBadge(entry.actionType)}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                              {getEntityLabel(entry.entityType)}
                            </span>
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <span className="font-semibold text-slate-900 text-sm">
                                  {parsed.headline}
                                </span>
                                <span className="text-xs text-slate-500 font-medium">
                                  — {parsed.subHeadline}
                                </span>
                              </div>
                              {parsed.chips.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                  {parsed.chips.map((chip, cIdx) => (
                                    <span
                                      key={cIdx}
                                      className="inline-flex items-center text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200/80 leading-tight"
                                    >
                                      {chip}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {parsed.recordId && (
                                <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1 pt-0.5">
                                  <span className="text-slate-300">管理番号:</span>
                                  <span>{parsed.recordId}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap text-xs text-slate-600">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {formatDate(entry.deletedTimestamp || entry.deletedAt)}
                            </div>
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap text-xs">
                            {(() => {
                              const opName = getDisplayOperatorName(entry.operator, entry.deviceInfo);
                              const activeGoogle = currentUser?.displayName || currentUser?.email || (typeof window !== 'undefined' ? (safeStorage.getItem('renge_google_user_name') || safeStorage.getItem('renge_google_user_email')) : '');
                              const isMe = activeGoogle && (
                                opName.toLowerCase() === activeGoogle.toLowerCase() ||
                                (currentUser?.email && opName.toLowerCase() === currentUser.email.toLowerCase()) ||
                                (currentUser?.displayName && opName === currentUser.displayName)
                              );
                              const isUnlinked = opName === 'Google未連携' || opName === '未ログイン';

                              return (
                                <div className="flex items-center gap-1.5">
                                  {isMe ? (
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  ) : isUnlinked ? (
                                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  ) : (
                                    <UserIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                  )}
                                  <span className={isMe ? 'font-semibold text-emerald-900' : (isUnlinked ? 'text-slate-500' : 'font-medium text-slate-800')}>
                                    {opName}
                                  </span>
                                  {isMe && (
                                    <span
                                      className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-medium shrink-0"
                                      title="現在ログイン中のGoogleアカウント"
                                    >
                                      自分
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap text-xs text-slate-500">
                            <div className="flex items-center gap-1">
                              {entry.deviceInfo?.includes('スマホ') ? (
                                <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                              ) : (
                                <Monitor className="w-3.5 h-3.5 text-slate-400" />
                              )}
                              <span>{entry.deviceInfo || 'PC'}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div>
            直近最大1000件の操作ログを保持・同期しています（過去の誤削除や他端末による操作を追跡可能）
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium transition-colors"
          >
            閉じる
          </button>
        </div>

      </div>
    </div>
  );
};
