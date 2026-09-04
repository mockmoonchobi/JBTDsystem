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

interface OperationHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  deletedRecords: DeletedRecordEntry[];
  onTriggerManualSync?: () => void;
  isSyncing?: boolean;
  spreadsheetUrl?: string | null;
  isGoogleConnected?: boolean;
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

  // Googleシート保有アカウント（管理者）または未設定・旧「寺院関係者」を「管理者」と統一表記
  // ※スタッフ端末（deviceInfoに「スタッフ」を含む場合）は、同一Googleアカウントでテストしていても「スタッフ」として識別
  const currentUser = getCurrentUser();
  const getDisplayOperatorName = (operator?: string, deviceInfo?: string) => {
    const isStaffDevice = (deviceInfo || '').includes('スタッフ');
    if (isStaffDevice) {
      if (!operator || !operator.trim() || operator.trim() === '管理者' || operator.trim() === '寺院関係者') {
        return 'スタッフ';
      }
      const clean = operator.trim();
      return clean.includes('スタッフ') ? clean : `スタッフ（${clean}）`;
    }

    if (!operator) return '管理者';
    const clean = operator.trim();
    if (!clean || clean === '寺院関係者' || clean === '管理者') return '管理者';
    if (currentUser) {
      if (currentUser.email && clean.toLowerCase() === currentUser.email.toLowerCase()) {
        return '管理者';
      }
      if (currentUser.displayName && clean === currentUser.displayName) {
        return '管理者';
      }
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
        const matchLogId = (r.logId || '').toLowerCase().includes(term);
        const matchOperator = displayOp.includes(term) || rawOp.includes(term);
        const matchDevice = (r.deviceInfo || '').toLowerCase().includes(term);
        if (!matchLabel && !matchId && !matchLogId && !matchOperator && !matchDevice) {
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
                placeholder="対象名、ID、操作者、端末情報で検索..."
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
                      <th className="py-3 px-3.5 whitespace-nowrap">履歴ID</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">操作種別</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">データ対象</th>
                      <th className="py-3 px-3.5">対象名称 / 内容</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">操作日時</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">操作者</th>
                      <th className="py-3 px-3.5 whitespace-nowrap">端末</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredRecords.map((entry, idx) => (
                      <tr key={entry.logId || `${entry.id}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3.5 font-mono text-xs text-slate-400 whitespace-nowrap">
                          {entry.logId || `LOG-${idx + 1}`}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          {getActionBadge(entry.actionType)}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                            {getEntityLabel(entry.entityType)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5">
                          <div className="font-medium text-slate-800">{entry.label || '-'}</div>
                          <div className="text-xs font-mono text-slate-400">ID: {entry.id}</div>
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-xs text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {formatDate(entry.deletedTimestamp || entry.deletedAt)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-xs">
                          {(() => {
                            const opName = getDisplayOperatorName(entry.operator, entry.deviceInfo);
                            const isOwnerAdmin = opName === '管理者';
                            const isStaff = opName.includes('スタッフ') || (entry.deviceInfo || '').includes('スタッフ');
                            return (
                              <div className="flex items-center gap-1.5">
                                {isOwnerAdmin ? (
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                ) : (
                                  <UserIcon className={`w-3.5 h-3.5 shrink-0 ${isStaff ? 'text-indigo-500' : 'text-slate-400'}`} />
                                )}
                                <span className={isOwnerAdmin ? 'font-medium text-slate-800' : (isStaff ? 'font-medium text-indigo-700' : 'text-slate-600')}>
                                  {opName}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-xs text-slate-500">
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
                    ))}
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
