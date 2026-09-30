import React, { useState, useMemo } from 'react';
import { 
  Users, 
  AlertTriangle, 
  Check, 
  CheckCircle2, 
  ArrowRight, 
  UserPlus, 
  FolderOpen, 
  HelpCircle, 
  Sparkles, 
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Tag,
  Ban
} from 'lucide-react';
import { 
  HouseholdIdConflict, 
  HouseholdConflictResolution, 
  HouseholdCandidateInfo,
  HouseholdSecondaryDecision,
  createDefaultResolutions
} from '../utils/householdConflictUtils';

interface HouseholdIdConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflicts: HouseholdIdConflict[];
  initialResolutions?: Record<string, HouseholdConflictResolution>;
  onConfirm: (resolutions: Record<string, HouseholdConflictResolution>) => void;
}

const COMMON_RELATIONSHIPS = ['弟', '兄', '長男', '次男', '長女', '子', '父', '母', '叔父', '親族'];

export const HouseholdIdConflictModal: React.FC<HouseholdIdConflictModalProps> = ({
  isOpen,
  onClose,
  conflicts,
  initialResolutions,
  onConfirm,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Local state for all resolutions
  const [resolutions, setResolutions] = useState<Record<string, HouseholdConflictResolution>>(() => {
    const defaults = createDefaultResolutions(conflicts);
    return { ...defaults, ...(initialResolutions || {}) };
  });

  // Keep state updated if conflicts change
  React.useEffect(() => {
    if (conflicts.length > 0) {
      setResolutions(prev => {
        const defaults = createDefaultResolutions(conflicts);
        return { ...defaults, ...prev, ...(initialResolutions || {}) };
      });
      setCurrentIndex(0);
    }
  }, [conflicts, initialResolutions]);

  const currentConflict: HouseholdIdConflict | undefined = conflicts[currentIndex];

  const currentResolution: HouseholdConflictResolution | undefined = useMemo(() => {
    if (!currentConflict) return undefined;
    return resolutions[currentConflict.conflictId] || {
      conflictId: currentConflict.conflictId,
      primaryCandidateId: currentConflict.candidates[0]?.id || '',
      secondaryDecisions: {},
    };
  }, [currentConflict, resolutions]);

  if (!isOpen || !currentConflict) return null;

  const totalConflicts = conflicts.length;
  const primaryId = currentResolution?.primaryCandidateId;
  const primaryCandidate = currentConflict.candidates.find(c => c.id === primaryId) || currentConflict.candidates[0];
  const secondaryCandidates = currentConflict.candidates.filter(c => c.id !== primaryCandidate?.id);

  // Handler to change which candidate is Primary
  const handleSelectPrimary = (candidateId: string) => {
    setResolutions(prev => {
      const current = prev[currentConflict.conflictId] || {
        conflictId: currentConflict.conflictId,
        primaryCandidateId: candidateId,
        secondaryDecisions: {},
      };

      const newSecondaryDecisions: Record<string, HouseholdSecondaryDecision> = {};
      currentConflict.candidates.forEach(c => {
        if (c.id !== candidateId) {
          // Retain prior decision if present, else default to add_as_family
          newSecondaryDecisions[c.id] = current.secondaryDecisions[c.id] || {
            action: 'add_as_family',
            relationship: '親族',
          };
        }
      });

      return {
        ...prev,
        [currentConflict.conflictId]: {
          conflictId: currentConflict.conflictId,
          primaryCandidateId: candidateId,
          secondaryDecisions: newSecondaryDecisions,
        },
      };
    });
  };

  // Handler to update secondary candidate decision
  const handleUpdateSecondaryDecision = (
    candidateId: string, 
    patch: Partial<HouseholdSecondaryDecision>
  ) => {
    setResolutions(prev => {
      const current = prev[currentConflict.conflictId];
      if (!current) return prev;

      const currentDecision = current.secondaryDecisions[candidateId] || {
        action: 'add_as_family',
        relationship: '親族',
      };

      return {
        ...prev,
        [currentConflict.conflictId]: {
          ...current,
          secondaryDecisions: {
            ...current.secondaryDecisions,
            [candidateId]: {
              ...currentDecision,
              ...patch,
            },
          },
        },
      };
    });
  };

  const handleNext = () => {
    if (currentIndex < totalConflicts - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleConfirmAll = () => {
    // Ensure all conflicts have resolutions populated
    const finalResolutions: Record<string, HouseholdConflictResolution> = { ...resolutions };
    conflicts.forEach(c => {
      if (!finalResolutions[c.conflictId]) {
        const primId = c.candidates[0].id;
        const secDec: Record<string, HouseholdSecondaryDecision> = {};
        c.candidates.slice(1).forEach(sc => {
          secDec[sc.id] = { action: 'add_as_family', relationship: '親族' };
        });
        finalResolutions[c.conflictId] = {
          conflictId: c.conflictId,
          primaryCandidateId: primId,
          secondaryDecisions: secDec,
        };
      }
    });

    onConfirm(finalResolutions);
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto no-print">
      <div className="bg-[#FAF9F5] border-2 border-[#D4AF37] shadow-2xl w-full max-w-4xl my-auto rounded-none flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-[#1A1A1A] border-b border-[#D4AF37] px-6 py-4 flex items-center justify-between text-[#F9F7F2]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-[#D4AF37] text-[#1A1A1A] flex items-center justify-center font-bold font-serif shadow">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-serif tracking-wider text-[#F9F7F2] flex items-center gap-2">
                檀家ID重複の解決
                <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 font-normal rounded-none">
                  {currentIndex + 1} / {totalConflicts} 件
                </span>
              </h2>
              <p className="text-xs text-[#D4AF37]/90 font-sans">
                同じ檀家IDを持つ檀徒が検出されました。主としてID・過去帳を引き継ぐ檀家と、もう一方の登録方法を選択してください。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#999999] hover:text-[#FFFFFF] p-1 transition-colors"
            title="閉じる"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Multi-conflict selector strip if > 1 conflict */}
        {totalConflicts > 1 && (
          <div className="bg-[#EFECE6] border-b border-[#D1CEC7] px-6 py-2 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-gray-500 font-medium shrink-0">重複一覧:</span>
            {conflicts.map((c, idx) => {
              const isCurrent = idx === currentIndex;
              const hasResolution = !!resolutions[c.conflictId];
              return (
                <button
                  key={c.conflictId}
                  onClick={() => setCurrentIndex(idx)}
                  className={`px-3 py-1 flex items-center gap-1.5 transition-colors shrink-0 ${
                    isCurrent 
                      ? 'bg-[#1A1A1A] text-white font-bold border border-[#1A1A1A]' 
                      : hasResolution
                      ? 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-100'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                >
                  <span>{c.conflictId}</span>
                  <span className="text-[10px] opacity-75">
                    ({c.candidates.map(cd => cd.familyHead).join(' / ')})
                  </span>
                  {hasResolution && <Check className="w-3 h-3 text-emerald-600" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Main Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[#FAF9F5]">
          
          {/* Explanation Banner */}
          <div className="bg-amber-50/80 border border-amber-300/80 p-3.5 text-xs text-amber-950 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-900">
                重複している檀家ID: <span className="font-mono bg-amber-200/80 px-2 py-0.5 text-sm">{currentConflict.conflictId}</span>
              </p>
              <p className="text-amber-800/90 leading-relaxed">
                同じ過去帳・同じ墓地を共有している親族（兄弟、親子、分家等）の場合、どちらか一方を「主」として旧IDと過去帳データを継承し、
                もう一方を「主の家族として登録（推奨）」または「新IDで独立世帯化（精霊なし）」として安全に整理できます。
              </p>
            </div>
          </div>

          {/* STEP 1: Choose Primary Household */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-bold text-[#1A1A1A] flex items-center gap-2">
                <span className="w-5 h-5 bg-[#1A1A1A] text-white flex items-center justify-center text-xs font-serif">1</span>
                どちらを「主（旧ID・過去帳を引き継ぐ檀家）」にしますか？
              </h3>
              <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 border border-emerald-200">
                主となった檀家がID「{currentConflict.conflictId}」と過去帳データを保持します
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentConflict.candidates.map((cand) => {
                const isSelected = cand.id === primaryCandidate?.id;
                return (
                  <div
                    key={cand.id}
                    onClick={() => handleSelectPrimary(cand.id)}
                    className={`p-4 border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#D4AF37] bg-[#FFFDF5] shadow-md ring-1 ring-[#D4AF37]/50'
                        : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50/50'
                    }`}
                  >
                    <div>
                      {/* Badge: Source */}
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[11px] px-2 py-0.5 font-medium border ${
                          cand.source === 'existing'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}>
                          {cand.source === 'existing'
                            ? `既存名簿の檀家（${cand.templeName || '所属寺院'}）`
                            : `取込ファイル 第 ${cand.displayRowNumber} 行`}
                        </span>

                        {isSelected && (
                          <span className="bg-[#D4AF37] text-white text-[11px] font-bold px-2 py-0.5 flex items-center gap-1 shadow-xs">
                            <Check className="w-3 h-3 stroke-[3]" /> 主に選択中
                          </span>
                        )}
                      </div>

                      {/* Name & Furigana */}
                      <div className="mb-2">
                        {cand.furigana && (
                          <div className="text-[11px] text-gray-500 font-sans">{cand.furigana}</div>
                        )}
                        <div className="text-base font-bold text-[#1A1A1A] font-serif">
                          {cand.familyHead} 様
                        </div>
                      </div>

                      {/* Details */}
                      <div className="text-xs text-gray-600 space-y-1 bg-gray-50 p-2.5 border border-gray-200">
                        <div className="flex gap-2">
                          <span className="text-gray-400 w-12 shrink-0">住所:</span>
                          <span className="truncate">{cand.address || '（住所未登録）'}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-gray-400 w-12 shrink-0">電話:</span>
                          <span>{cand.phone || cand.mobile || '（電話未登録）'}</span>
                        </div>
                        {(cand.householdType || cand.district || cand.tombNumber) && (
                          <div className="flex gap-2 text-[11px] text-gray-500 pt-1 border-t border-gray-200">
                            {cand.householdType && <span>区分: {cand.householdType}</span>}
                            {cand.district && <span>役職/地区: {cand.district}</span>}
                            {cand.tombNumber && <span>墓番: {cand.tombNumber}</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Radio-style Selector */}
                    <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-800 cursor-pointer">
                        <input
                          type="radio"
                          name={`primary-${currentConflict.conflictId}`}
                          checked={isSelected}
                          onChange={() => handleSelectPrimary(cand.id)}
                          className="accent-[#D4AF37] w-4 h-4 cursor-pointer"
                        />
                        <span>この檀家を「主」にする</span>
                      </label>
                      {isSelected && (
                        <span className="text-[11px] text-[#B89628] font-medium">
                          旧ID「{currentConflict.conflictId}」を継承
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* STEP 2: Configure Secondary Candidate(s) */}
          <div className="pt-2 border-t border-gray-300">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[#1A1A1A] flex items-center gap-2">
                <span className="w-5 h-5 bg-[#1A1A1A] text-white flex items-center justify-center text-xs font-serif">2</span>
                もう一方の檀徒の登録方法を選択してください
              </h3>
              <span className="text-xs text-gray-500">
                主（{primaryCandidate?.familyHead} 様）以外の取り扱いを設定します
              </span>
            </div>

            <div className="space-y-4">
              {secondaryCandidates.map((secCand) => {
                const decision = currentResolution?.secondaryDecisions[secCand.id] || {
                  action: 'add_as_family',
                  relationship: '親族',
                };

                return (
                  <div key={secCand.id} className="bg-white border border-gray-300 p-4 space-y-3 shadow-xs">
                    {/* Header info of this secondary candidate */}
                    <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] px-2 py-0.5 border ${
                          secCand.source === 'existing'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}>
                          {secCand.source === 'existing' ? '既存檀家' : `取込 第${secCand.displayRowNumber}行`}
                        </span>
                        <span className="font-bold text-sm text-[#1A1A1A]">
                          {secCand.familyHead} 様
                        </span>
                        {secCand.address && (
                          <span className="text-xs text-gray-500 truncate max-w-xs">
                            ({secCand.address})
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 border border-amber-200">
                        対象: 独立登録または家族登録
                      </span>
                    </div>

                    {/* Radio Options */}
                    <div className="space-y-3 text-xs">
                      
                      {/* Option A: Add as family member */}
                      <div 
                        onClick={() => handleUpdateSecondaryDecision(secCand.id, { action: 'add_as_family' })}
                        className={`p-3 border transition-colors cursor-pointer ${
                          decision.action === 'add_as_family'
                            ? 'border-[#D4AF37] bg-[#FFFDF5] ring-1 ring-[#D4AF37]/40'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <input
                            type="radio"
                            name={`action-${secCand.id}`}
                            checked={decision.action === 'add_as_family'}
                            onChange={() => handleUpdateSecondaryDecision(secCand.id, { action: 'add_as_family' })}
                            className="mt-0.5 accent-[#D4AF37] w-4 h-4 cursor-pointer"
                          />
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                                <Users className="w-4 h-4 text-[#D4AF37]" />
                                主（{primaryCandidate?.familyHead} 様）の「家族」として登録する
                              </span>
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 border border-emerald-300 font-bold">
                                おすすめ・同墓所/親族
                              </span>
                            </div>
                            <p className="text-gray-600 leading-relaxed text-[11px]">
                              主世帯の家族名簿に登録されます。電話番号や住所等の連絡先情報も家族情報としてそのまま保持されます。
                            </p>

                            {/* Relationship input (visible when add_as_family selected) */}
                            {decision.action === 'add_as_family' && (
                              <div className="mt-2.5 pt-2 border-t border-amber-200/60 bg-amber-50/50 p-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                                <span className="font-bold text-gray-700 shrink-0 text-xs">
                                  主との続柄:
                                </span>
                                <input
                                  type="text"
                                  value={decision.relationship || ''}
                                  onChange={(e) => handleUpdateSecondaryDecision(secCand.id, { relationship: e.target.value })}
                                  placeholder="例: 弟、長男、親族"
                                  className="border border-gray-300 bg-white px-2.5 py-1 text-xs w-36 focus:outline-hidden focus:border-[#D4AF37]"
                                />
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[10px] text-gray-400">候補:</span>
                                  {COMMON_RELATIONSHIPS.map((rel) => (
                                    <button
                                      type="button"
                                      key={rel}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUpdateSecondaryDecision(secCand.id, { relationship: rel });
                                      }}
                                      className={`px-1.5 py-0.5 text-[10px] border transition-colors ${
                                        decision.relationship === rel
                                          ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                                      }`}
                                    >
                                      {rel}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Option B: Assign new ID */}
                      <div 
                        onClick={() => handleUpdateSecondaryDecision(secCand.id, { action: 'new_id' })}
                        className={`p-3 border transition-colors cursor-pointer ${
                          decision.action === 'new_id'
                            ? 'border-[#D4AF37] bg-[#FFFDF5] ring-1 ring-[#D4AF37]/40'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <input
                            type="radio"
                            name={`action-${secCand.id}`}
                            checked={decision.action === 'new_id'}
                            onChange={() => handleUpdateSecondaryDecision(secCand.id, { action: 'new_id' })}
                            className="mt-0.5 accent-[#D4AF37] w-4 h-4 cursor-pointer"
                          />
                          <div className="space-y-0.5 flex-1">
                            <span className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                              <Tag className="w-4 h-4 text-blue-600" />
                              新たなIDを自動採番し、独立した檀家（精霊なし）として登録する
                            </span>
                            <p className="text-gray-600 leading-relaxed text-[11px]">
                              新しい空き番号を自動で割り振ります。過去帳などの精霊データは引き継がれません（後から必要に応じて過去帳画面で手動移動が可能です）。
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Option C: Skip (Do not import) */}
                      {secCand.source === 'file' && (
                        <div 
                          onClick={() => handleUpdateSecondaryDecision(secCand.id, { action: 'skip' })}
                          className={`p-3 border transition-colors cursor-pointer ${
                            decision.action === 'skip'
                              ? 'border-red-400 bg-red-50/50 ring-1 ring-red-300'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="radio"
                              name={`action-${secCand.id}`}
                              checked={decision.action === 'skip'}
                              onChange={() => handleUpdateSecondaryDecision(secCand.id, { action: 'skip' })}
                              className="mt-0.5 accent-red-600 w-4 h-4 cursor-pointer"
                            />
                            <div className="space-y-0.5 flex-1">
                              <span className="font-bold text-sm text-red-900 flex items-center gap-1.5">
                                <Ban className="w-4 h-4 text-red-600" />
                                この檀徒データは取り込まない（スキップ）
                              </span>
                              <p className="text-red-700/80 leading-relaxed text-[11px]">
                                重複した不要行である場合などに選択してください。この行の取り込みをスキップします。
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer Navigation & Submit */}
        <div className="bg-[#EFECE6] border-t border-[#D1CEC7] px-6 py-3.5 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-400 bg-white hover:bg-gray-100 text-gray-700 font-sans text-xs transition-colors"
          >
            キャンセルして戻る
          </button>

          <div className="flex items-center gap-3">
            {totalConflicts > 1 && (
              <div className="flex items-center gap-1.5 mr-2">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="p-1.5 border border-gray-300 bg-white text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 text-xs flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> 前の重複
                </button>
                <span className="text-xs text-gray-600 font-mono px-1">
                  {currentIndex + 1} / {totalConflicts}
                </span>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={currentIndex === totalConflicts - 1}
                  className="p-1.5 border border-gray-300 bg-white text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 text-xs flex items-center gap-1"
                >
                  次の重複 <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleConfirmAll}
              className="px-6 py-2 bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold text-xs tracking-wider border border-[#D4AF37] transition-all flex items-center gap-2 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
              この設定で決定して進む
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
