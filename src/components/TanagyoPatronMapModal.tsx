import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import {
  X,
  MapPin,
  Calendar,
  UserCheck,
  ArrowUpDown,
  CheckCircle2,
  ExternalLink,
  Layers,
  Sparkles,
  Plus,
  ChevronRight,
  Info,
  Navigation,
  RefreshCw,
  Sun,
  Moon,
  Maximize2,
  MoveDown,
  RotateCcw,
  Check,
  Users,
  UserPlus,
} from 'lucide-react';
import { Household, Priest, TempleInfo, PastRecord, TempleProfile } from '../types';
import { LatLng, batchGeocodeAddresses, geocodeAddressWithGSI } from '../utils/geocoding';
import { getHouseholdSponsorName, isRelevantNiibon } from '../utils/memorialCalculator';

interface TanagyoPatronMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  households: Household[];
  priests: Priest[];
  templeInfo: TempleInfo;
  temples?: TempleProfile[];
  pastRecords?: PastRecord[];
  onBatchUpdateHouseholds: (updatedHouseholds: Household[], actionDescription?: string) => void;
  candidateDates?: string[];
}

// 日程ごとの識別カラーパレット
const DATE_COLORS = [
  '#2563EB', // 青 (8/13等)
  '#16A34A', // 緑 (8/14等)
  '#9333EA', // 紫 (8/15等)
  '#EA580C', // 橙
  '#0891B2', // シアン
  '#D97706', // アンバー
  '#DB2777', // ピンク
];

// 僧侶ごとの識別カラーパレット
const PRIEST_COLORS = [
  '#8C2D19', // 圓福寺 弁柄色
  '#1E3A8A', // 紺
  '#065F46', // 深緑
  '#6B21A8', // 深紫
  '#B45309', // 黄土
];

// 寺院ごとのピン枠線識別カラーパレット（地図上でピンの◯の枠線として区別）
export const TEMPLE_BORDER_PALETTE = [
  '#F59E0B', // 金・アンバー (本寺等)
  '#10B981', // エメラルドグリーン
  '#8B5CF6', // 紫
  '#EC4899', // ピンク
  '#06B6D4', // シアン
  '#F97316', // オレンジ
  '#3B82F6', // 青
];

export const TanagyoPatronMapModal: React.FC<TanagyoPatronMapModalProps> = ({
  isOpen,
  onClose,
  households,
  priests,
  templeInfo,
  temples = [],
  pastRecords,
  onBatchUpdateHouseholds,
  candidateDates = ['8/13', '8/14', '8/15'],
}) => {
  // 寺院ごとのピン枠線色を取得するヘルパー
  const getTempleBorderColor = (templeId?: string) => {
    const mainTemple = temples.find((t) => t.isMain) || temples[0];
    const targetId = templeId || mainTemple?.id || templeInfo.id || 'temple-main';
    const idx = temples.findIndex((t) => t.id === targetId);
    if (idx >= 0) {
      return TEMPLE_BORDER_PALETTE[idx % TEMPLE_BORDER_PALETTE.length];
    }
    return '#F59E0B';
  };

  // 新盆判定ヘルパー
  const checkIsNiibon = (h: Household): boolean => {
    if (h.notes?.includes('新盆') || h.tanagyoNotes?.includes('新盆')) return true;
    if (pastRecords && pastRecords.length > 0) {
      const records = pastRecords.filter((p) => p.householdId === h.id);
      return records.some((r) => isRelevantNiibon(r.niibon, r.deathDate, templeInfo.bonSeason || '8月盆'));
    }
    return false;
  };

  // ステップ状態: 1=日程決め, 2=担当僧侶決め, 3=巡回順序＆午前午後決め
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // 全割当リセットの確認モーダル状態
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);

  // 寺院絞り込み ('ALL' または 寺院ID)
  const [selectedTempleFilter, setSelectedTempleFilter] = useState<string>('ALL');

  // モーダル内ローカル世帯データ
  const [localHouseholds, setLocalHouseholds] = useState<Household[]>([]);
  // 変更フラグ
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  // 日程候補リスト
  const [datesList, setDatesList] = useState<string[]>(candidateDates);
  const [newDateInput, setNewDateInput] = useState<string>('');

  // ステップ1用: 選択中の適用日程
  const [step1SelectedDate, setStep1SelectedDate] = useState<string>(candidateDates[0] || '8/13');

  // ステップ2用: 絞り込み日程・適用担当僧侶
  const [step2FilterDate, setStep2FilterDate] = useState<string>(candidateDates[0] || '8/13');
  const [step2SelectedPriestId, setStep2SelectedPriestId] = useState<string>('');

  // ステップ3用: 絞り込み枠（日程、担当僧侶）※午前午後は順序の中でバーで決定
  const [step3FilterDate, setStep3FilterDate] = useState<string>(candidateDates[0] || '8/13');
  const [step3FilterPriestId, setStep3FilterPriestId] = useState<string>('');
  
  // ステップ3: クリック連番採番モード
  const [isNumberingMode, setIsNumberingMode] = useState<boolean>(false);
  const [nextOrderNum, setNextOrderNum] = useState<number>(1);

  // 地図レイヤー種別 ('std'=標準, 'pale'=淡色, 'photo'=写真)
  const [tileType, setTileType] = useState<'std' | 'pale' | 'photo'>('std');

  // 選択中の世帯（ハイライト用）
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);

  // 住所座標データ
  const [coordinates, setCoordinates] = useState<Record<string, LatLng>>({});
  const [isLoadingCoords, setIsLoadingCoords] = useState<boolean>(false);
  const [coordProgress, setCoordProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  // 寺院座標
  const [templeCoord, setTempleCoord] = useState<LatLng>({ lat: 35.6581, lng: 139.7482 });

  // 地図コンテナRef
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);

  // 初回フィットまたはステップ切替時のみフィットさせるためのフラグ管理
  const isFirstFitDoneRef = useRef<boolean>(false);
  const prevFilterKeyRef = useRef<string>('');
  const prevIsOpenRef = useRef<boolean>(false);
  const initialHouseholdsRef = useRef<Household[]>([]);

  // 棚経対象世帯（tanagyoMonthlyVisit === true）
  const allTanagyoPatrons = useMemo(() => {
    return localHouseholds.filter((h) => !!h.tanagyoMonthlyVisit);
  }, [localHouseholds]);

  // 寺院絞り込み適用後の棚経対象世帯
  const tanagyoPatrons = useMemo(() => {
    if (selectedTempleFilter === 'ALL') return allTanagyoPatrons;
    const mainTemple = temples.find((t) => t.isMain) || temples[0];
    const mainTempleId = mainTemple?.id || templeInfo.id || 'temple-main';
    return allTanagyoPatrons.filter((h) => {
      const hTempleId = h.templeId || mainTempleId;
      return hTempleId === selectedTempleFilter;
    });
  }, [allTanagyoPatrons, selectedTempleFilter, temples, templeInfo.id]);

  // モーダルオープン時の初期化（モーダルが開いた瞬間に保存状態を復元・同期）
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      // 1. 各世帯の tanagyoPriestId と tanagyoPriestName を僧侶マスタと照合して相互補完・正規化
      const normalizedHouseholds: Household[] = households.map((h) => {
        let assignedId = h.tanagyoPriestId;
        let assignedName = h.tanagyoPriestName;
        if (assignedId && !assignedName) {
          const p = priests.find((pr) => pr.id === assignedId || pr.name === assignedId);
          if (p) {
            assignedId = p.id;
            assignedName = p.name;
          }
        } else if (assignedName && !assignedId) {
          const p = priests.find((pr) => pr.name === assignedName || pr.id === assignedName);
          if (p) {
            assignedId = p.id;
            assignedName = p.name;
          }
        } else if (assignedId && assignedName) {
          const p = priests.find((pr) => pr.id === assignedId || pr.name === assignedName);
          if (p) {
            assignedId = p.id;
            assignedName = p.name;
          }
        }
        return {
          ...h,
          tanagyoPriestId: assignedId,
          tanagyoPriestName: assignedName,
        };
      });

      initialHouseholdsRef.current = JSON.parse(JSON.stringify(normalizedHouseholds));
      setLocalHouseholds(JSON.parse(JSON.stringify(normalizedHouseholds)));
      setHasChanges(false);
      setIsNumberingMode(false);
      setDatesList(candidateDates);

      // 2. 既に順路や担当僧侶が設定されている世帯を探し、初期選択（日程・僧侶・ステップ）をスマート復元！
      const orderedHousehold = normalizedHouseholds.find((h) => h.tanagyoOrder && h.tanagyoDate);
      const assignedHousehold =
        orderedHousehold ||
        normalizedHouseholds.find((h) => (h.tanagyoPriestId || h.tanagyoPriestName) && h.tanagyoDate);
      const targetDate =
        (assignedHousehold && assignedHousehold.tanagyoDate) || candidateDates[0] || '8/13';

      let targetPriestId = priests[0]?.id || '';
      if (assignedHousehold) {
        const p = priests.find(
          (pr) =>
            pr.id === assignedHousehold.tanagyoPriestId ||
            pr.name === assignedHousehold.tanagyoPriestName
        );
        if (p) targetPriestId = p.id;
      }

      setStep1SelectedDate(targetDate);
      setStep2FilterDate(targetDate);
      setStep3FilterDate(targetDate);
      if (targetPriestId) {
        setStep2SelectedPriestId(targetPriestId);
        setStep3FilterPriestId(targetPriestId);
      }

      // 順路が既に組まれている場合はステップ3、担当僧侶が割り振られている場合はステップ2、そうでなければステップ1
      if (orderedHousehold) {
        setActiveStep(3);
      } else if (assignedHousehold) {
        setActiveStep(2);
      } else {
        setActiveStep(1);
      }

      isFirstFitDoneRef.current = false;
      prevFilterKeyRef.current = '';
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, households, candidateDates, priests]);

  // 寺院座標の取得
  useEffect(() => {
    if (!isOpen) return;
    const addr = templeInfo.address || '東京都港区芝公園4-7-35';
    geocodeAddressWithGSI(addr).then((coord) => {
      if (coord) setTempleCoord(coord);
    });
  }, [isOpen, templeInfo.address]);

  // 棚経対象者の住所座標一括取得
  useEffect(() => {
    if (!isOpen) return;
    const addresses = Array.from(
      new Set(
        tanagyoPatrons
          .map((h) => (h.tanagyoAddress || h.address || '').trim())
          .filter((a) => a.length > 0)
      )
    );

    if (addresses.length === 0) return;

    setIsLoadingCoords(true);
    setCoordProgress({ done: 0, total: addresses.length });

    batchGeocodeAddresses(addresses, (done, total) => {
      setCoordProgress({ done, total });
    }).then((coords) => {
      setCoordinates(coords);
      setIsLoadingCoords(false);
    });
  }, [isOpen, tanagyoPatrons]);

  // Leaflet 地図の初期化
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    // すでに初期化済みの場合は削除して再作成
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [templeCoord.lat, templeCoord.lng],
      zoom: 14,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    // タイルレイヤー
    const getTileUrl = (type: 'std' | 'pale' | 'photo') => {
      if (type === 'pale') return 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
      if (type === 'photo') return 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg';
      return 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
    };

    L.tileLayer(getTileUrl(tileType), {
      attribution:
        '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院</a>',
      maxZoom: 18,
    }).addTo(map);

    // マーカーグループ
    const markersGroup = L.layerGroup().addTo(map);
    markersGroupRef.current = markersGroup;

    // 巡回ルートポリライン
    const polyline = L.polyline([], {
      color: '#8C2D19',
      weight: 4,
      opacity: 0.85,
      dashArray: '6, 8',
      lineCap: 'round',
    }).addTo(map);
    routePolylineRef.current = polyline;

    mapInstanceRef.current = map;

    // コンテナサイズ再計算
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, templeCoord]);

  // タイル種別切り替え時の更新
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        let url = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
        if (tileType === 'pale') url = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
        if (tileType === 'photo') url = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg';
        layer.setUrl(url);
      }
    });
  }, [tileType]);

  // 日程の色を取得するヘルパー
  const getDateColor = (dateStr?: string) => {
    if (!dateStr || dateStr.trim() === '') return '#DC2626'; // 未割当: 赤
    const idx = datesList.indexOf(dateStr.trim());
    if (idx >= 0) return DATE_COLORS[idx % DATE_COLORS.length];
    return '#4F46E5';
  };

  // 世帯に割り当てられた僧侶オブジェクトを解決するヘルパー
  const resolveAssignedPriest = useCallback(
    (h: Household): Priest | undefined => {
      if (h.tanagyoPriestId) {
        const byId = priests.find((p) => p.id === h.tanagyoPriestId);
        if (byId) return byId;
        const byNameAsId = priests.find((p) => p.name === h.tanagyoPriestId);
        if (byNameAsId) return byNameAsId;
      }
      if (h.tanagyoPriestName) {
        const byName = priests.find((p) => p.name === h.tanagyoPriestName);
        if (byName) return byName;
        const byIdAsName = priests.find((p) => p.id === h.tanagyoPriestName);
        if (byIdAsName) return byIdAsName;
      }
      return undefined;
    },
    [priests]
  );

  // 僧侶の色を取得するヘルパー（IDまたは名前から柔軟に解決）
  const getPriestColor = useCallback(
    (priestIdOrName?: string) => {
      if (!priestIdOrName) return '#6B7280';
      const idx = priests.findIndex(
        (p) => p.id === priestIdOrName || p.name === priestIdOrName
      );
      if (idx >= 0) return PRIEST_COLORS[idx % PRIEST_COLORS.length];
      return '#374151';
    },
    [priests]
  );

  // 世帯の割当情報更新ハンドラ
  const updateHouseholdAssignment = (
    householdId: string,
    updates: Partial<Household>
  ) => {
    setLocalHouseholds((prev) =>
      prev.map((h) => {
        if (h.id === householdId) {
          return { ...h, ...updates };
        }
        return h;
      })
    );
    setHasChanges(true);
  };

  // 日程候補の追加
  const handleAddDate = () => {
    if (!newDateInput.trim()) return;
    const clean = newDateInput.trim();
    if (!datesList.includes(clean)) {
      setDatesList((prev) => [...prev, clean]);
    }
    setNewDateInput('');
  };

  // ステップ2用: 残りの未定檀家をすべて選択中の僧侶に一括割当（2人等で巡回する際の「残りは全部◯◯」）
  const handleAssignRemainingToSelectedPriest = (priestId: string) => {
    const targetPriest = priests.find((p) => p.id === priestId);
    if (!targetPriest) return;

    const unassignedInDate = tanagyoPatrons.filter((h) => {
      if (h.tanagyoDate !== step2FilterDate) return false;
      const assigned = resolveAssignedPriest(h);
      return !assigned && !h.tanagyoPriestId && !h.tanagyoPriestName;
    });

    if (unassignedInDate.length === 0) {
      alert(`【${step2FilterDate}】には、現在担当が未定の檀家はありません。`);
      return;
    }

    const unassignedCount = unassignedInDate.length;
    setLocalHouseholds((prev) =>
      prev.map((h) => {
        if (h.tanagyoDate !== step2FilterDate) return h;
        const assigned = resolveAssignedPriest(h);
        if (!assigned && !h.tanagyoPriestId && !h.tanagyoPriestName) {
          return {
            ...h,
            tanagyoPriestId: targetPriest.id,
            tanagyoPriestName: targetPriest.name,
          };
        }
        return h;
      })
    );
    setHasChanges(true);
  };

  // ステップ2用: 該当日の全檀家を選択中の僧侶に一括割当
  const handleAssignAllDateToSelectedPriest = (priestId: string) => {
    const targetPriest = priests.find((p) => p.id === priestId);
    if (!targetPriest) return;

    const patronsInDate = tanagyoPatrons.filter((h) => h.tanagyoDate === step2FilterDate);
    if (patronsInDate.length === 0) {
      alert(`【${step2FilterDate}】には棚経対象の檀家がありません。ステップ1で日程を設定してください。`);
      return;
    }

    if (
      !window.confirm(
        `【${step2FilterDate}】の全檀家（${patronsInDate.length}軒）の担当僧侶を、すべて「${targetPriest.name} 師」に一括設定しますか？`
      )
    ) {
      return;
    }

    setLocalHouseholds((prev) =>
      prev.map((h) => {
        if (h.tanagyoDate !== step2FilterDate) return h;
        return {
          ...h,
          tanagyoPriestId: targetPriest.id,
          tanagyoPriestName: targetPriest.name,
        };
      })
    );
    setHasChanges(true);
  };

  // ステップ2用: 1人で巡回する寺院向け - 全日程・すべての棚経檀家を一括で選択中の僧侶に割当
  const handleAssignAllPatronsToSelectedPriest = (priestId: string) => {
    const targetPriest = priests.find((p) => p.id === priestId);
    if (!targetPriest) return;

    if (tanagyoPatrons.length === 0) {
      alert('棚経対象の檀家がありません。');
      return;
    }

    if (
      !window.confirm(
        `全日程のすべての棚経対象檀家（${tanagyoPatrons.length}軒）の担当僧侶を、一括で「${targetPriest.name} 師」に設定しますか？\n\n※1人で巡回されるお寺に最適です。`
      )
    ) {
      return;
    }

    const patronIdSet = new Set(tanagyoPatrons.map((h) => h.id));
    setLocalHouseholds((prev) =>
      prev.map((h) => {
        if (!patronIdSet.has(h.id)) return h;
        return {
          ...h,
          tanagyoPriestId: targetPriest.id,
          tanagyoPriestName: targetPriest.name,
        };
      })
    );
    setHasChanges(true);
  };

  // ステップ2用: 該当日の担当僧侶割当をすべて解除して未定に戻す
  const handleResetDatePriestAssignments = () => {
    const assignedInDate = tanagyoPatrons.filter((h) => {
      if (h.tanagyoDate !== step2FilterDate) return false;
      const assigned = resolveAssignedPriest(h);
      return Boolean(assigned || h.tanagyoPriestId || h.tanagyoPriestName);
    });

    if (assignedInDate.length === 0) {
      alert(`【${step2FilterDate}】には、現在担当僧侶が割り当てられている檀家はありません。`);
      return;
    }

    if (
      !window.confirm(
        `【${step2FilterDate}】の檀家（${assignedInDate.length}軒）の担当僧侶の割当をすべて解除し、未定に戻しますか？`
      )
    ) {
      return;
    }

    setLocalHouseholds((prev) =>
      prev.map((h) => {
        if (h.tanagyoDate !== step2FilterDate) return h;
        return {
          ...h,
          tanagyoPriestId: '',
          tanagyoPriestName: '',
        };
      })
    );
    setHasChanges(true);
  };

  // ステップ3: 該当枠の巡回リスト（日付＋僧侶で絞り込み、order昇順）
  const step3TargetHouseholds = useMemo(() => {
    return tanagyoPatrons
      .filter((h) => {
        const matchDate = h.tanagyoDate === step3FilterDate;
        if (!matchDate) return false;
        if (!step3FilterPriestId) return true;
        const assigned = resolveAssignedPriest(h);
        const filterPriest = priests.find((p) => p.id === step3FilterPriestId);
        if (assigned) {
          return (
            assigned.id === step3FilterPriestId ||
            (filterPriest && assigned.name === filterPriest.name)
          );
        }
        return (
          h.tanagyoPriestId === step3FilterPriestId ||
          h.tanagyoPriestName === step3FilterPriestId ||
          (filterPriest && h.tanagyoPriestName === filterPriest.name)
        );
      })
      .sort((a, b) => (a.tanagyoOrder || 999) - (b.tanagyoOrder || 999));
  }, [tanagyoPatrons, step3FilterDate, step3FilterPriestId, priests, resolveAssignedPriest]);

  // 【午前／午後 仕切りバーの位置】
  // 午前午後は「ここから午後」のバーで決める。最初の「午後」となっているインデックス
  const afternoonStartIndex = useMemo(() => {
    const idx = step3TargetHouseholds.findIndex((h) => h.tanagyoTimeSlot === '午後');
    // 全て午前なら末尾（=全員午前）、該当なしなら中間または全員午前
    if (idx !== -1) return idx;
    // 初期状態など未設定の場合は全員午前とする
    return step3TargetHouseholds.length;
  }, [step3TargetHouseholds]);

  // 仕切りバーの位置を変更した時の処理（index番目以降を「午後」、それ以前を「午前」にする）
  const handleSetAfternoonBoundary = (splitIndex: number) => {
    const updates = step3TargetHouseholds.map((h, idx) => {
      const slot = idx >= splitIndex ? '午後' : '午前';
      return { id: h.id, tanagyoTimeSlot: slot };
    });

    setLocalHouseholds((prev) =>
      prev.map((h) => {
        const found = updates.find((u) => u.id === h.id);
        if (found) {
          return { ...h, tanagyoTimeSlot: found.tanagyoTimeSlot };
        }
        return h;
      })
    );
    setHasChanges(true);
  };

  // 手動で全体表示にリセットする関数（檀家ピンの全体に合わせる）
  const handleFitAllToMap = () => {
    if (!mapInstanceRef.current) return;
    const bounds = L.latLngBounds([]);
    let count = 0;
    tanagyoPatrons.forEach((h) => {
      let lat = h.latitude;
      let lng = h.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        const addr = (h.tanagyoAddress || h.address || '').trim();
        const coord = coordinates[addr];
        if (coord) {
          lat = coord.lat;
          lng = coord.lng;
        }
      }
      if (typeof lat === 'number' && typeof lng === 'number') {
        bounds.extend([lat, lng]);
        count++;
      }
    });
    if (count > 0) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    } else {
      mapInstanceRef.current.setView([templeCoord.lat, templeCoord.lng], 14);
    }
  };

  // 地図マーカーとルート線の再描画
  useEffect(() => {
    if (!mapInstanceRef.current || !markersGroupRef.current) return;
    const map = mapInstanceRef.current;
    const group = markersGroupRef.current;
    group.clearLayers();

    // 寺院マーカーは表示不要のため配置せず、檀家ピンのみを描画
    const latLngBounds = L.latLngBounds([]);
    let validCoordCount = 0;

    // ステップに応じた対象世帯の絞り込み
    let displayPatrons = tanagyoPatrons;
    if (activeStep === 2) {
      // ステップ2: 日毎にフォーカス
      displayPatrons = tanagyoPatrons.filter((h) => h.tanagyoDate === step2FilterDate);
    } else if (activeStep === 3) {
      // ステップ3: 日程 ＋ 担当僧侶で絞り込み
      displayPatrons = tanagyoPatrons.filter((h) => {
        const matchDate = h.tanagyoDate === step3FilterDate;
        if (!matchDate) return false;
        if (!step3FilterPriestId) return true;
        const assigned = resolveAssignedPriest(h);
        const filterPriest = priests.find((p) => p.id === step3FilterPriestId);
        if (assigned) {
          return (
            assigned.id === step3FilterPriestId ||
            (filterPriest && assigned.name === filterPriest.name)
          );
        }
        return (
          h.tanagyoPriestId === step3FilterPriestId ||
          h.tanagyoPriestName === step3FilterPriestId ||
          (filterPriest && h.tanagyoPriestName === filterPriest.name)
        );
      });
      // 順序順（tanagyoOrder）にソート
      displayPatrons.sort((a, b) => (a.tanagyoOrder || 999) - (b.tanagyoOrder || 999));
    }

    // ステップ3 ルート線用座標配列（檀家間のみを結ぶ）
    const routeCoords: [number, number][] = [];

    // ── 座標の解決と同一地点ピンの分散（スパイダー化/オフセット配置）──
    interface ResolvedPin {
      household: Household;
      baseCoord: { lat: number; lng: number };
      isCustom: boolean; // 手動でドラッグして確定した位置か
      displayCoord: { lat: number; lng: number };
      isOffset: boolean; // 同一住所・同一座標のため少しズラして表示されているか
    }

    const resolvedPins: ResolvedPin[] = [];

    displayPatrons.forEach((h) => {
      let baseCoord: { lat: number; lng: number } | null = null;
      let isCustom = false;

      // 1. 手動設定された正確な緯度経度がある場合を最優先
      if (
        typeof h.latitude === 'number' &&
        typeof h.longitude === 'number' &&
        !isNaN(h.latitude) &&
        !isNaN(h.longitude)
      ) {
        baseCoord = { lat: h.latitude, lng: h.longitude };
        isCustom = true;
      } else {
        // 2. 国土地理院住所検索の座標
        const addr = (h.tanagyoAddress || h.address || '').trim();
        const coord = coordinates[addr];
        if (coord) {
          baseCoord = coord;
          isCustom = false;
        }
      }

      if (baseCoord) {
        resolvedPins.push({
          household: h,
          baseCoord,
          isCustom,
          displayCoord: { ...baseCoord },
          isOffset: false,
        });
      }
    });

    // 手動設定されていないピンで、同一座標（または極近接: 緯度経度差 0.00005度以内）の世帯をグループ化
    const overlapGroups = new Map<string, ResolvedPin[]>();
    resolvedPins.forEach((pin) => {
      if (!pin.isCustom) {
        // 約1メートル精度に丸めて同一キー化
        const key = `${pin.baseCoord.lat.toFixed(5)},${pin.baseCoord.lng.toFixed(5)}`;
        const groupList = overlapGroups.get(key) || [];
        groupList.push(pin);
        overlapGroups.set(key, groupList);
      }
    });

    // 同一キーに2件以上ある場合、円周上に微小オフセットさせて重なりを解消
    overlapGroups.forEach((groupItems) => {
      const count = groupItems.length;
      if (count > 1) {
        groupItems.forEach((pin, index) => {
          // 半径: 2〜3件なら約0.00022度（約20〜25m）、件数が多い場合は少し広げる
          const radius = count <= 3 ? 0.00022 : count <= 6 ? 0.00030 : 0.00038;
          // 円周上に均等配置（上から時計回り）
          const angle = (2 * Math.PI * index) / count - Math.PI / 2;
          const latOffset = radius * Math.sin(angle);
          const lngOffset = (radius * Math.cos(angle)) / Math.cos((pin.baseCoord.lat * Math.PI) / 180);

          pin.displayCoord = {
            lat: pin.baseCoord.lat + latOffset,
            lng: pin.baseCoord.lng + lngOffset,
          };
          pin.isOffset = true;
        });
      }
    });

    // 各檀家マーカーの描画
    resolvedPins.forEach((pin) => {
      const h = pin.household;
      const addr = (h.tanagyoAddress || h.address || '').trim();
      const coord = pin.displayCoord;

      validCoordCount++;
      latLngBounds.extend([coord.lat, coord.lng]);

      if (activeStep === 3) {
        routeCoords.push([coord.lat, coord.lng]);
      }

      const sponsorName = getHouseholdSponsorName(h) || h.familyHead || '檀家';
      const isSelected = selectedHouseholdId === h.id;
      const templeBorderColor = getTempleBorderColor(h.templeId);

      // ピンの背景色と内容
      let pinColor = '#DC2626';
      let pinText = '';
      let subLabel = '';

      if (activeStep === 1) {
        // ステップ1: 日程ごとの色分け
        pinColor = getDateColor(h.tanagyoDate);
        pinText = h.tanagyoDate || '未';
        subLabel = sponsorName;
      } else if (activeStep === 2) {
        // ステップ2: 担当僧侶ごとの色分け（午前午後はまだ気にしない）
        const priestObj = resolveAssignedPriest(h);
        pinColor = priestObj
          ? getPriestColor(priestObj.id)
          : getPriestColor(h.tanagyoPriestId || h.tanagyoPriestName);
        const priestDisplayName = priestObj ? priestObj.name : h.tanagyoPriestName || '';
        pinText = priestDisplayName ? priestDisplayName.slice(0, 2) : '未';
        subLabel = `${sponsorName} (${priestDisplayName ? priestDisplayName : '担当未定'})`;
      } else if (activeStep === 3) {
        // ステップ3: 順序番号 (No.1, 2, 3...) と午前/午後の区分
        const isPM = h.tanagyoTimeSlot === '午後';
        pinColor = isPM ? '#C2410C' : '#1D4ED8'; // 午前: 青, 午後: 橙
        pinText = h.tanagyoOrder ? `${h.tanagyoOrder}` : '・';
        const slotMark = isPM ? 'PM' : 'AM';
        subLabel = `No.${h.tanagyoOrder || '?'} ${sponsorName} [${slotMark}]`;
      }

      // 新盆チェック
      const isNiibon = checkIsNiibon(h);

      // ピン上の追加バッジ（※緑の「確定」バッジは下の◯を隠してしまうため非表示にする）
      const customBadgeHtml = pin.isOffset
        ? `<span style="position: absolute; top: -6px; left: -6px; background-color: #4F46E5; color: white; font-size: 7px; padding: 1px 2px; border-radius: 6px; border: 1px solid white; font-weight: bold; box-shadow: 0 1px 2px rgba(0,0,0,0.3); pointer-events: none;" title="同一住所のため分散配置中">分散</span>`
        : '';

      const markerHtml = `
        <div style="
          position: relative;
          background-color: ${pinColor};
          color: white;
          width: ${isSelected ? '36px' : '30px'};
          height: ${isSelected ? '36px' : '30px'};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: ${activeStep === 3 ? '13px' : '11px'};
          border: 3.5px solid ${templeBorderColor};
          box-shadow: ${isSelected ? '0 0 0 4px #2563EB, 0 4px 10px rgba(0,0,0,0.5)' : '0 3px 6px rgba(0,0,0,0.35)'};
          cursor: grab;
          transition: transform 0.15s ease;
        ">
          ${pinText}
          ${isNiibon ? '<span style="position: absolute; top: -5px; right: -5px; background-color: #EF4444; color: white; font-size: 9px; padding: 1px 3px; border-radius: 10px; border: 1px solid white; font-weight: bold;">新</span>' : ''}
          ${customBadgeHtml}
        </div>
        <div style="
          background-color: ${isSelected ? '#F59E0B' : 'rgba(255,255,255,0.92)'};
          color: ${isSelected ? '#000000' : '#1F2937'};
          font-size: 10px;
          font-weight: bold;
          padding: 1px 4px;
          border-radius: 3px;
          position: absolute;
          top: ${isSelected ? '38px' : '32px'};
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          border: 1px solid rgba(0,0,0,0.15);
          pointer-events: none;
        ">
          ${subLabel}
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: markerHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      // マーカーをドラッグ可能（draggable: true）に設定
      const marker = L.marker([coord.lat, coord.lng], {
        icon: customIcon,
        draggable: true,
        autoPan: true,
      }).addTo(group);

      let isDraggingMarker = false;

      marker.on('dragstart', () => {
        isDraggingMarker = true;
        marker.closePopup();
      });

      marker.on('dragend', (e: any) => {
        const newLatLng = e.target.getLatLng();
        // 小数第6位（約0.1m精度）に丸める
        const newLat = Math.round(newLatLng.lat * 1000000) / 1000000;
        const newLng = Math.round(newLatLng.lng * 1000000) / 1000000;

        // ドラッグした正確な位置をこの世帯の緯度経度として保存
        updateHouseholdAssignment(h.id, {
          latitude: newLat,
          longitude: newLng,
        });

        // ドラッグ直後のクリック発火を防止
        setTimeout(() => {
          isDraggingMarker = false;
        }, 250);
      });

      // マーカークリック時のアクション（ドラッグ直後はクリックを発火させない）
      marker.on('click', () => {
        if (isDraggingMarker) return;
        setSelectedHouseholdId(h.id);

        if (activeStep === 1) {
          // ステップ1: 選択中の日程を割り当て（同じなら未割当へトグル）
          const nextDate = h.tanagyoDate === step1SelectedDate ? '' : step1SelectedDate;
          updateHouseholdAssignment(h.id, { tanagyoDate: nextDate });
        } else if (activeStep === 2) {
          // ステップ2: 担当僧侶のみを割り当て
          const priestObj = priests.find((p) => p.id === step2SelectedPriestId);
          updateHouseholdAssignment(h.id, {
            tanagyoPriestId: step2SelectedPriestId,
            tanagyoPriestName: priestObj ? priestObj.name : '',
          });
        } else if (activeStep === 3) {
          // ステップ3: 連番採番モード中の場合は次の順番をセット
          if (isNumberingMode) {
            updateHouseholdAssignment(h.id, { tanagyoOrder: nextOrderNum });
            setNextOrderNum((prev) => prev + 1);
          }
        }
      });

      // ポップアップ内容
      const assignedPriest = resolveAssignedPriest(h);
      const priestName =
        assignedPriest?.name || h.tanagyoPriestName || '未定';
      
      const popupHtml = `
        <div style="font-size: 12px; font-family: sans-serif; min-width: 210px; line-height: 1.4;">
          <div style="font-weight: bold; font-size: 14px; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 5px; display: flex; align-items: center; justify-content: space-between; gap: 4px;">
            <span>
              ${sponsorName} 様
              ${isNiibon ? '<span style="color: #DC2626; font-size: 11px; margin-left: 4px;">[新盆]</span>' : ''}
            </span>
          </div>
          <div style="color: #4B5563; font-size: 11px; margin-bottom: 4px;">
            📍 ${addr || '住所未登録'}
          </div>
          <div style="margin-top: 6px; padding: 4px; background: #F3F4F6; border-radius: 4px;">
            <div>📅 日程: <strong>${h.tanagyoDate || '未割当'}</strong></div>
            <div>👤 担当: <strong>${priestName}</strong></div>
            <div>⏰ 時間帯: <strong>${h.tanagyoTimeSlot || '未設定'}</strong></div>
            <div>🔢 順序: <strong>${h.tanagyoOrder ? `No.${h.tanagyoOrder}` : '未採番'}</strong></div>
          </div>

          ${pin.isCustom ? `
            <div style="margin-top: 6px; padding: 5px; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 4px; font-size: 11px;">
              <div style="color: #065F46; font-weight: bold; display: flex; align-items: center; justify-content: space-between;">
                <span>📍 正確な位置を保存済</span>
              </div>
              <div style="color: #047857; font-size: 10px; margin-top: 2px;">
                緯度: ${h.latitude?.toFixed(6)}, 経度: ${h.longitude?.toFixed(6)}
              </div>
              <button
                id="reset-pin-pos-${h.id}"
                type="button"
                style="margin-top: 5px; width: 100%; padding: 3px 6px; font-size: 10px; background: white; border: 1px solid #D1D5DB; border-radius: 3px; cursor: pointer; color: #4B5563; font-weight: 500;"
              >
                ↺ 住所の自動位置に戻す
              </button>
            </div>
          ` : pin.isOffset ? `
            <div style="margin-top: 6px; padding: 4px 6px; background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 4px; font-size: 10.5px; color: #3730A3; line-height: 1.35;">
              ℹ️ 同一住所のためピンを少しズラして表示しています。<br/>
              <strong>ピンをドラッグ</strong>して正確な檀家宅の位置へ移動・保存できます。
            </div>
          ` : `
            <div style="margin-top: 6px; padding: 4px 6px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 4px; font-size: 10.5px; color: #4B5563; line-height: 1.35;">
              💡 <strong>ピンをドラッグ</strong>して正確な檀家宅の位置へ移動・保存できます。
            </div>
          `}
        </div>
      `;

      marker.bindPopup(popupHtml);

      // ポップアップ内の「住所の自動位置に戻す」ボタンのバインド
      marker.on('popupopen', () => {
        const resetBtn = document.getElementById(`reset-pin-pos-${h.id}`);
        if (resetBtn) {
          resetBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            updateHouseholdAssignment(h.id, {
              latitude: undefined,
              longitude: undefined,
            });
            marker.closePopup();
          };
        }
      });
    });

    // ステップ3 ポリライン更新
    if (routePolylineRef.current) {
      if (activeStep === 3 && routeCoords.length > 1) {
        routePolylineRef.current.setLatLngs(routeCoords);
      } else {
        routePolylineRef.current.setLatLngs([]);
      }
    }

    // ★★★ 拡大位置の維持ロジック ★★★
    // 初回表示時、または「ステップや大枠の日程絞り込み」が大きく切り替わった時のみ fitBounds を実行。
    // ピンのクリックや個別割当変更では、ユーザーが拡大・移動した地図の中心・ズームをそのまま維持！
    const currentFilterKey = `${activeStep}-${step2FilterDate}-${step3FilterDate}-${step3FilterPriestId}`;
    const shouldFit = !isFirstFitDoneRef.current || (prevFilterKeyRef.current !== '' && prevFilterKeyRef.current !== currentFilterKey);

    if (shouldFit && validCoordCount > 0) {
      map.fitBounds(latLngBounds, { padding: [40, 40], maxZoom: 16 });
      isFirstFitDoneRef.current = true;
      prevFilterKeyRef.current = currentFilterKey;
    }
  }, [
    activeStep,
    localHouseholds,
    tanagyoPatrons,
    coordinates,
    datesList,
    priests,
    selectedHouseholdId,
    step1SelectedDate,
    step2FilterDate,
    step2SelectedPriestId,
    step3FilterDate,
    step3FilterPriestId,
    isNumberingMode,
    nextOrderNum,
    templeCoord,
    templeInfo,
  ]);

  // ステップ3: 順序番号の上下移動
  const handleMoveOrder = (householdId: string, direction: 'up' | 'down') => {
    const list = [...step3TargetHouseholds];
    const idx = list.findIndex((h) => h.id === householdId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === list.length - 1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;

    // 1..N に再採番しつつ、現在の午前午後境界（afternoonStartIndex）を維持して適用
    const updates = list.map((h, i) => ({
      id: h.id,
      tanagyoOrder: i + 1,
      tanagyoTimeSlot: i >= afternoonStartIndex ? '午後' : '午前',
    }));

    setLocalHouseholds((prev) =>
      prev.map((h) => {
        const found = updates.find((u) => u.id === h.id);
        if (found) {
          return { ...h, tanagyoOrder: found.tanagyoOrder, tanagyoTimeSlot: found.tanagyoTimeSlot };
        }
        return h;
      })
    );
    setHasChanges(true);
  };

  // ステップ3: 自動採番（現在の並び順のまま 1..N に連番を確定、境界に応じて午前午後も自動適用）
  const handleAutoNormalizeOrder = () => {
    const list = [...step3TargetHouseholds];
    const updates = list.map((h, i) => ({
      id: h.id,
      tanagyoOrder: i + 1,
      tanagyoTimeSlot: i >= afternoonStartIndex ? '午後' : '午前',
    }));

    setLocalHouseholds((prev) =>
      prev.map((h) => {
        const found = updates.find((u) => u.id === h.id);
        if (found) {
          return { ...h, tanagyoOrder: found.tanagyoOrder, tanagyoTimeSlot: found.tanagyoTimeSlot };
        }
        return h;
      })
    );
    setHasChanges(true);
    setIsNumberingMode(false);
  };

  // 地図上で特定の世帯のピンにフォーカス
  const handleFocusHouseholdOnMap = (h: Household) => {
    setSelectedHouseholdId(h.id);
    if (!mapInstanceRef.current) return;
    let lat = h.latitude;
    let lng = h.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      const addr = (h.tanagyoAddress || h.address || '').trim();
      const coord = coordinates[addr];
      if (coord) {
        lat = coord.lat;
        lng = coord.lng;
      }
    }
    if (typeof lat === 'number' && typeof lng === 'number') {
      mapInstanceRef.current.panTo([lat, lng], { animate: true });
    }
  };

  // Googleマップでこの巡回ルートを開く（檀家間を巡回）
  const handleOpenGoogleMapsRoute = () => {
    if (step3TargetHouseholds.length === 0) {
      alert('巡回対象の檀家がありません。');
      return;
    }
    
    // 正確な緯度経度があればそれを優先、なければ住所
    const getPointParam = (h: Household) => {
      if (typeof h.latitude === 'number' && typeof h.longitude === 'number') {
        return `${h.latitude},${h.longitude}`;
      }
      return encodeURIComponent((h.tanagyoAddress || h.address || '').trim());
    };

    if (step3TargetHouseholds.length === 1) {
      const p = getPointParam(step3TargetHouseholds[0]);
      window.open(`https://www.google.com/maps/search/?api=1&query=${p}`, '_blank');
      return;
    }

    const origin = getPointParam(step3TargetHouseholds[0]);
    const destination = getPointParam(step3TargetHouseholds[step3TargetHouseholds.length - 1]);

    const waypoints = step3TargetHouseholds
      .slice(1, -1)
      .map(getPointParam)
      .filter((w) => w.length > 0)
      .join('|');

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (waypoints) {
      url += `&waypoints=${waypoints}`;
    }
    window.open(url, '_blank');
  };

  // 保存して親へ反映（ここまでの編集を保存して終了：実際に変更された世帯のみを親に反映）
  const handleSaveAndApply = () => {
    const initialMap = new Map(initialHouseholdsRef.current.map((h) => [h.id, h]));
    const propMap = new Map(households.map((h) => [h.id, h]));

    const changedHouseholds = localHouseholds.filter((local) => {
      const init = initialMap.get(local.id) || propMap.get(local.id);
      if (!init) return true; // 新規追加等
      // 棚経関連フィールドまたは実質データの変更を確認
      return (
        (local.tanagyoDate || '') !== (init.tanagyoDate || '') ||
        (local.tanagyoTimeSlot || '') !== (init.tanagyoTimeSlot || '') ||
        (local.tanagyoPriestId || '') !== (init.tanagyoPriestId || '') ||
        (local.tanagyoPriestName || '') !== (init.tanagyoPriestName || '') ||
        local.tanagyoOrder !== init.tanagyoOrder ||
        local.latitude !== init.latitude ||
        local.longitude !== init.longitude ||
        (local.tanagyoAddress || '') !== (init.tanagyoAddress || '') ||
        (local.tanagyoNotes || '') !== (init.tanagyoNotes || '') ||
        local.tanagyoMonthlyVisit !== init.tanagyoMonthlyVisit ||
        JSON.stringify(local) !== JSON.stringify(init)
      );
    });

    if (changedHouseholds.length > 0) {
      const hasPinPosChange = changedHouseholds.some((local) => {
        const init = initialMap.get(local.id) || propMap.get(local.id);
        return init && (local.latitude !== init.latitude || local.longitude !== init.longitude);
      });

      let desc = `棚経訪問マップ計画による一括更新（${changedHouseholds.length}軒）`;
      if (changedHouseholds.length === 1) {
        const name = getHouseholdSponsorName(changedHouseholds[0]) || changedHouseholds[0].familyHead || '檀家';
        desc = hasPinPosChange ? `棚経「${name}」の訪問位置（ピン）を調整` : `棚経「${name}」の訪問計画を変更`;
      } else if (changedHouseholds.length <= 3) {
        const names = changedHouseholds.map((h) => getHouseholdSponsorName(h) || h.familyHead || '檀家').join('・');
        desc = hasPinPosChange ? `棚経「${names}」の訪問計画・ピン位置を変更` : `棚経「${names}」の訪問計画を変更`;
      }
      onBatchUpdateHouseholds(changedHouseholds, desc);
    }

    setHasChanges(false);
    onClose();
  };

  // 右上×ボタン用：編集したところまで保存して終了（変更がなければそのまま終了）
  const handleCloseWithAutoSave = () => {
    if (hasChanges) {
      handleSaveAndApply();
    } else {
      onClose();
    }
  };

  // 変更を保存せずに破棄して閉じる
  const handleDiscardAndClose = () => {
    if (hasChanges && !window.confirm('編集中の計画変更を保存せずに破棄して閉じますか？')) {
      return;
    }
    setHasChanges(false);
    onClose();
  };

  // 全ての設定を未割当に戻すリセット確認を開く
  const handleOpenResetConfirm = () => {
    setShowResetConfirmModal(true);
  };

  // 全割当のリセット実行
  const handleExecuteResetAll = () => {
    const mainTemple = temples.find((t) => t.isMain) || temples[0];
    const mainTempleId = mainTemple?.id || templeInfo.id || 'temple-main';

    setLocalHouseholds((prev) =>
      prev.map((h) => {
        // 所属寺院の絞り込みがある場合は対象寺院のみリセット
        if (selectedTempleFilter !== 'ALL') {
          const hTempleId = h.templeId || mainTempleId;
          if (hTempleId !== selectedTempleFilter) return h;
        }

        // 棚経対象世帯または何らかの棚経割当がある世帯をクリア
        return {
          ...h,
          tanagyoDate: '',
          tanagyoTimeSlot: '',
          tanagyoPriestId: '',
          tanagyoPriestName: '',
          tanagyoOrder: undefined,
        };
      })
    );
    setHasChanges(true);
    setShowResetConfirmModal(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4">
      <div className="bg-[#FAF7F0] border-2 border-[#8C2D19] rounded-xs shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* モーダルヘッダー */}
        <div className="bg-[#8C2D19] text-white px-4 py-3 flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-[#D4AF37] rounded-xs text-[#8C2D19]">
              <MapPin className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-serif font-black text-base sm:text-lg tracking-wide flex items-center gap-2">
                <span>お盆棚経・訪問マップ巡回計画</span>
                <span className="text-[11px] font-sans font-normal px-2 py-0.5 bg-white/20 rounded-full">
                  国土地理院地図 連携
                </span>
              </h3>
              <p className="text-[11px] text-amber-100/90 font-sans">
                直感的に計画・割当できます（いつでも保存して終了可能・右上の「✕」または「保存して終了」で確定）
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            {isLoadingCoords ? (
              <div className="flex items-center gap-1.5 text-xs bg-black/30 px-2.5 py-1 rounded-xs border border-amber-300/40 text-amber-200">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>
                  座標特定中 ({coordProgress.done}/{coordProgress.total})
                </span>
              </div>
            ) : null}

            {/* 保存して終了ボタン（ヘッダーで常時ワンクリック終了可能） */}
            <button
              type="button"
              onClick={handleSaveAndApply}
              className={`flex items-center gap-1.5 px-3 py-1.5 font-bold text-xs rounded-xs shadow-xs cursor-pointer transition-colors ${
                hasChanges
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400 animate-pulse'
                  : 'bg-white/15 hover:bg-white/25 text-white border border-white/20'
              }`}
              title="編集した内容を保存して画面を終了します"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>保存して終了</span>
            </button>

            {/* 破棄して閉じる（変更がある場合のみ表示） */}
            {hasChanges && (
              <button
                type="button"
                onClick={handleDiscardAndClose}
                className="hidden sm:inline-block text-[11px] text-amber-200 hover:text-white underline cursor-pointer px-1 py-0.5"
                title="編集内容を保存せずに破棄して閉じます"
              >
                変更を破棄
              </button>
            )}

            {/* 右上×ボタン：編集したところまでで保存終了 */}
            <button
              type="button"
              onClick={handleCloseWithAutoSave}
              className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded-xs cursor-pointer transition-colors"
              title={hasChanges ? '編集した内容を保存して閉じます' : '閉じる'}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* 3ステップ ナビゲーションバー */}
        <div className="bg-[#EFECE6] border-b border-[#D1CEC7] px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center space-x-1 sm:space-x-2">
            {/* ステップ1 */}
            <button
              type="button"
              onClick={() => setActiveStep(1)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xs font-bold text-xs sm:text-sm cursor-pointer transition-all ${
                activeStep === 1
                  ? 'bg-[#8C2D19] text-white shadow-sm ring-1 ring-[#8C2D19]'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-black">
                1
              </span>
              <span>① 日程決め（エリア別色分け）</span>
            </button>

            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />

            {/* ステップ2 */}
            <button
              type="button"
              onClick={() => setActiveStep(2)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xs font-bold text-xs sm:text-sm cursor-pointer transition-all ${
                activeStep === 2
                  ? 'bg-[#8C2D19] text-white shadow-sm ring-1 ring-[#8C2D19]'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-black">
                2
              </span>
              <span>② 担当僧侶決め（エリア割振）</span>
            </button>

            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />

            {/* ステップ3 */}
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xs font-bold text-xs sm:text-sm cursor-pointer transition-all ${
                activeStep === 3
                  ? 'bg-[#8C2D19] text-white shadow-sm ring-1 ring-[#8C2D19]'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-black">
                3
              </span>
              <span>③ 巡回順序＆午前午後仕切りバー</span>
            </button>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            {/* 寺院絞り込みセレクター */}
            {temples && temples.length > 1 && (
              <div className="flex items-center space-x-1 text-xs bg-white border border-gray-300 px-2 py-1 rounded-xs shadow-2xs">
                <span className="text-gray-500 font-bold whitespace-nowrap">所属寺院:</span>
                <select
                  value={selectedTempleFilter}
                  onChange={(e) => setSelectedTempleFilter(e.target.value)}
                  className="bg-transparent font-bold text-gray-800 outline-hidden cursor-pointer text-xs"
                >
                  <option value="ALL">全寺院（本寺・兼務寺 合算: {allTanagyoPatrons.length}軒）</option>
                  {temples.map((t) => {
                    const isM = t.isMain || t.id === 'temple-main';
                    const mainId = temples.find((x) => x.isMain)?.id || 'temple-main';
                    const count = allTanagyoPatrons.filter((h) => (h.templeId || mainId) === t.id).length;
                    return (
                      <option key={t.id} value={t.id}>
                        {isM ? `【本寺】${t.name}` : `【兼務】${t.name}`} ({count}軒)
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* 全体表示に戻すボタン */}
            <button
              type="button"
              onClick={handleFitAllToMap}
              className="px-2.5 py-1 text-xs bg-white hover:bg-gray-100 text-gray-700 font-bold border border-gray-300 rounded-xs flex items-center gap-1 shadow-2xs cursor-pointer"
              title="地図全体を表示範囲に戻す"
            >
              <Maximize2 className="w-3.5 h-3.5 text-gray-500" />
              <span>全体を表示</span>
            </button>

            {/* 全割当を未割当にリセットボタン */}
            <button
              type="button"
              onClick={handleOpenResetConfirm}
              className="px-2.5 py-1 text-xs bg-white hover:bg-red-50 text-red-700 font-bold border border-red-300 rounded-xs flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
              title="現在の棚経割当（日程・担当・順序）をすべて解除し、未割当に戻します"
            >
              <RotateCcw className="w-3.5 h-3.5 text-red-600" />
              <span>全割当を未割当にリセット</span>
            </button>

            {/* 寺院枠線凡例 */}
            {temples.length > 0 && (
              <div className="flex items-center space-x-2 text-xs bg-white border border-gray-300 px-2 py-1 rounded-xs shadow-2xs">
                <span className="text-gray-500 font-bold text-[11px] shrink-0">寺院別枠線:</span>
                <div className="flex items-center gap-2 overflow-x-auto max-w-[280px]">
                  {temples.map((t, idx) => {
                    const borderColor = TEMPLE_BORDER_PALETTE[idx % TEMPLE_BORDER_PALETTE.length];
                    return (
                      <div key={t.id} className="flex items-center gap-1 shrink-0" title={`${t.name}のピン枠線色`}>
                        <span
                          className="w-3 h-3 rounded-full border-[2.5px] bg-white shadow-2xs shrink-0"
                          style={{ borderColor }}
                        />
                        <span className="text-[11px] text-gray-700 font-bold truncate max-w-[70px]">{t.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 地図タイル切替 */}
            <div className="flex items-center space-x-1 text-xs bg-white border border-gray-300 p-0.5 rounded-xs">
              <span className="text-gray-500 font-bold px-1.5 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" /> 地図:
              </span>
              <button
                type="button"
                onClick={() => setTileType('std')}
                className={`px-2 py-0.5 rounded-2xs font-bold cursor-pointer ${
                  tileType === 'std' ? 'bg-[#8C2D19] text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                標準
              </button>
              <button
                type="button"
                onClick={() => setTileType('pale')}
                className={`px-2 py-0.5 rounded-2xs font-bold cursor-pointer ${
                  tileType === 'pale' ? 'bg-[#8C2D19] text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                淡色
              </button>
              <button
                type="button"
                onClick={() => setTileType('photo')}
                className={`px-2 py-0.5 rounded-2xs font-bold cursor-pointer ${
                  tileType === 'photo' ? 'bg-[#8C2D19] text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                航空写真
              </button>
            </div>
          </div>
        </div>

        {/* メインエリア: 地図 ＋ 操作サイドパネル */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* 地図描画エリア */}
          <div className="flex-1 h-[45vh] lg:h-auto relative bg-[#e5e3df]">
            <div ref={mapContainerRef} className="w-full h-full z-0" />

            {/* 地図上の操作ヒント */}
            <div className="absolute top-2 left-2 z-10 bg-white/95 backdrop-blur-xs border border-gray-300 px-3 py-2 rounded-xs shadow-md text-xs pointer-events-none max-w-md">
              <div className="font-bold text-[#8C2D19] flex items-center gap-1">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {activeStep === 1 && '【日程決め】ピンをクリックして日程を色分け'}
                  {activeStep === 2 && '【担当決め】ピンをクリックして担当僧侶を割当'}
                  {activeStep === 3 && '【巡回順序】ピンをクリックして順番採番・午後バーで区切り'}
                </span>
              </div>
              <div className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                💡 <strong className="text-gray-800">ピンをドラッグ</strong>して正確な檀家宅の位置に移動・保存できます。
                同一住所の重なりは自動で少しズラして表示しています。
              </div>
            </div>
          </div>

          {/* 右側: ステップ別操作パネル */}
          <div className="w-full lg:w-[400px] xl:w-[440px] bg-white border-t lg:border-t-0 lg:border-l border-[#D1CEC7] flex flex-col shrink-0 overflow-hidden shadow-sm">
            {/* ====== STEP 1: 日程決め ====== */}
            {activeStep === 1 && (
              <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
                <div className="border-b border-gray-200 pb-2">
                  <h4 className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[#8C2D19]" />
                    <span>ステップ1: 巡回日程の割り当て（色分け）</span>
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">
                    下記から「割当先の日程」を選択し、地図上のピンをクリックするとその日程の色に変わります。
                  </p>
                </div>

                {/* 適用日程パレット */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-700">
                    割当する日程を選択（ピンクリックで即時割当）:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {datesList.map((d) => {
                      const color = getDateColor(d);
                      const count = tanagyoPatrons.filter((h) => h.tanagyoDate === d).length;
                      const isSelected = step1SelectedDate === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setStep1SelectedDate(d)}
                          className={`p-2 rounded-xs border-2 text-left cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? 'border-[#8C2D19] bg-amber-50 shadow-sm ring-1 ring-[#8C2D19]'
                              : 'border-gray-200 bg-white hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs"
                              style={{ backgroundColor: color }}
                            />
                            <span className="font-black text-xs text-[#1A1A1A]">{d}</span>
                          </div>
                          <span className="text-[11px] px-1.5 py-0.2 bg-gray-100 text-gray-700 font-bold rounded-full">
                            {count}軒
                          </span>
                        </button>
                      );
                    })}

                    {/* 未割当リセット用ボタン */}
                    <button
                      type="button"
                      onClick={() => setStep1SelectedDate('')}
                      className={`p-2 rounded-xs border-2 text-left cursor-pointer transition-all flex items-center justify-between ${
                        step1SelectedDate === ''
                          ? 'border-red-600 bg-red-50 shadow-sm ring-1 ring-red-500'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-3.5 h-3.5 rounded-full shrink-0 bg-red-600 shadow-2xs" />
                        <span className="font-black text-xs text-red-700">未割当に戻す</span>
                      </div>
                      <span className="text-[11px] px-1.5 py-0.2 bg-red-100 text-red-800 font-bold rounded-full">
                        {tanagyoPatrons.filter((h) => !h.tanagyoDate).length}軒
                      </span>
                    </button>
                  </div>

                  {/* 新規日程の追加 */}
                  <div className="flex items-center space-x-1.5 pt-1">
                    <input
                      type="text"
                      value={newDateInput}
                      onChange={(e) => setNewDateInput(e.target.value)}
                      placeholder="例: 8/16"
                      className="flex-1 p-1.5 border border-gray-300 text-xs rounded-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddDate}
                      className="px-2.5 py-1.5 bg-[#8C2D19] text-white font-bold text-xs rounded-xs cursor-pointer hover:bg-[#702414] flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> 日程追加
                    </button>
                  </div>
                </div>

                {/* 檀信徒一覧リスト（日程別） */}
                <div className="flex-1 flex flex-col min-h-0 border border-gray-200 rounded-xs overflow-hidden">
                  <div className="bg-gray-100 px-3 py-1.5 border-b border-gray-200 text-xs font-bold text-gray-700 flex justify-between items-center">
                    <span>檀信徒リスト（全 {tanagyoPatrons.length} 軒）</span>
                    <span className="text-[11px] text-gray-500">クリックで地図移動</span>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-gray-100 text-xs">
                    {tanagyoPatrons.map((h) => {
                      const color = getDateColor(h.tanagyoDate);
                      const sponsor = getHouseholdSponsorName(h) || h.familyHead;
                      const isSelected = selectedHouseholdId === h.id;
                      return (
                        <div
                          key={h.id}
                          onClick={() => handleFocusHouseholdOnMap(h)}
                          className={`p-2 flex items-center justify-between cursor-pointer hover:bg-amber-50/60 ${
                            isSelected ? 'bg-amber-100/70 font-bold' : ''
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-1.5 truncate">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span className="font-bold text-gray-800 truncate">{sponsor} 様</span>
                              {checkIsNiibon(h) && (
                                <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded-2xs font-bold">
                                  新盆
                                </span>
                              )}
                              {typeof h.latitude === 'number' && typeof h.longitude === 'number' && (
                                <span
                                  className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded-2xs font-bold border border-emerald-300 shrink-0"
                                  title={`手動調整済み位置: (${h.latitude.toFixed(5)}, ${h.longitude.toFixed(5)})`}
                                >
                                  📍確定
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 truncate pl-4">
                              {h.tanagyoAddress || h.address || '住所未登録'}
                            </div>
                          </div>
                          <span
                            className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-2xs"
                            style={{ backgroundColor: color }}
                          >
                            {h.tanagyoDate || '未割当'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ====== STEP 2: 担当僧侶決め（エリア別割振） ====== */}
            {activeStep === 2 && (
              <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
                <div className="border-b border-gray-200 pb-2">
                  <h4 className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-[#8C2D19]" />
                    <span>ステップ2: 担当僧侶の割り当て</span>
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">
                    対象の「巡回日」を選択し、担当僧侶を選んでピンをクリックすると担当者が割り振られます。（※午前午後は次のステップ3でまとめて設定します）
                  </p>
                </div>

                {/* 対象日程の選択 */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    ① 作業対象の日程を選択:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {datesList.map((d) => {
                      const count = tanagyoPatrons.filter((h) => h.tanagyoDate === d).length;
                      const isSelected = step2FilterDate === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setStep2FilterDate(d)}
                          className={`px-3 py-1.5 rounded-xs font-bold text-xs cursor-pointer border flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-[#8C2D19] text-white border-[#8C2D19]'
                              : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                          }`}
                        >
                          <span>{d}</span>
                          <span className="text-[10px] opacity-80">({count}軒)</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 担当僧侶パレット */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700">
                    ② 割当する担当僧侶を選択（ピンをクリックして個別割当）:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {priests.map((p) => {
                      const color = getPriestColor(p.id);
                      const isSelected = step2SelectedPriestId === p.id;
                      const count = tanagyoPatrons.filter((h) => {
                        if (h.tanagyoDate !== step2FilterDate) return false;
                        const assigned = resolveAssignedPriest(h);
                        return (
                          assigned?.id === p.id ||
                          (!assigned && (h.tanagyoPriestId === p.id || h.tanagyoPriestName === p.name))
                        );
                      }).length;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setStep2SelectedPriestId(p.id)}
                          className={`p-2 rounded-xs border text-left cursor-pointer flex items-center justify-between transition-all ${
                            isSelected
                              ? 'border-[#8C2D19] bg-amber-50 ring-2 ring-[#8C2D19] shadow-xs'
                              : 'border-gray-300 bg-white hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center space-x-2 min-w-0 pr-1">
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="font-bold text-xs text-gray-800 truncate">{p.name}</span>
                          </div>
                          <span className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded-full font-bold">
                            {count}軒
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ⚡️ 一括割当アクションパネル（1人巡回 & 2人等で残りを全部◯◯に割り当てる機能） */}
                {(() => {
                  const selectedPriest =
                    priests.find((p) => p.id === step2SelectedPriestId) || priests[0];
                  const datePatrons = tanagyoPatrons.filter((h) => h.tanagyoDate === step2FilterDate);
                  const datePatronsCount = datePatrons.length;
                  const unassignedInDate = datePatrons.filter((h) => {
                    const assigned = resolveAssignedPriest(h);
                    return !assigned && !h.tanagyoPriestId && !h.tanagyoPriestName;
                  });
                  const unassignedCount = unassignedInDate.length;
                  const assignedCountInDate = datePatronsCount - unassignedCount;

                  if (!selectedPriest) return null;

                  return (
                    <div className="bg-gradient-to-br from-amber-50/90 to-orange-50/90 border border-amber-300/90 p-2.5 rounded-xs space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-black text-[#8C2D19]">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>一括割当ツール（選択中: {selectedPriest.name} 師）</span>
                        </div>
                        <span className="text-[11px] text-gray-600 font-medium">
                          未定: <strong className="text-red-600 font-bold">{unassignedCount}軒</strong> / 計{datePatronsCount}軒
                        </span>
                      </div>

                      <div className="space-y-1.5 pt-0.5">
                        {/* アクション1: 残りの未定をすべてこの僧侶に割当（2人の場合の「残りは全部◯◯」） */}
                        <button
                          type="button"
                          onClick={() => handleAssignRemainingToSelectedPriest(selectedPriest.id)}
                          disabled={unassignedCount === 0}
                          className={`w-full py-1.5 px-2.5 text-xs font-bold rounded-xs flex items-center justify-between border cursor-pointer transition-all shadow-2xs ${
                            unassignedCount > 0
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 active:scale-[0.99]'
                              : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                          }`}
                          title="ピン等で一部の檀家を他僧侶に割り振った後、残りの未定世帯を一括でこの僧侶に割り当てます"
                        >
                          <span className="flex items-center gap-1.5 truncate pr-1">
                            <UserPlus className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              残りの未定をすべて「{selectedPriest.name} 師」に割当
                            </span>
                          </span>
                          <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded-full shrink-0 font-black">
                            {unassignedCount}軒
                          </span>
                        </button>

                        {/* アクション2: この日の全檀家を一括割当 */}
                        <button
                          type="button"
                          onClick={() => handleAssignAllDateToSelectedPriest(selectedPriest.id)}
                          disabled={datePatronsCount === 0}
                          className={`w-full py-1.5 px-2.5 text-xs font-bold rounded-xs flex items-center justify-between border cursor-pointer transition-all shadow-2xs ${
                            datePatronsCount > 0
                              ? 'bg-white hover:bg-amber-100/80 text-gray-800 border-amber-300 hover:border-amber-400 active:scale-[0.99]'
                              : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                          }`}
                          title={`【${step2FilterDate}】の全檀家（${datePatronsCount}軒）をすべて「${selectedPriest.name} 師」に割り当てます`}
                        >
                          <span className="flex items-center gap-1.5 truncate pr-1">
                            <Users className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                            <span className="truncate">
                              {step2FilterDate} の全檀家を「{selectedPriest.name} 師」に一括割当
                            </span>
                          </span>
                          <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded-full shrink-0 font-bold">
                            {datePatronsCount}軒
                          </span>
                        </button>

                        {/* アクション3: 1人で巡回する寺院向け - 全日程・すべての棚経檀家を一括割当 */}
                        <button
                          type="button"
                          onClick={() => handleAssignAllPatronsToSelectedPriest(selectedPriest.id)}
                          disabled={tanagyoPatrons.length === 0}
                          className="w-full py-1.5 px-2.5 bg-gradient-to-r from-amber-100 via-orange-100 to-amber-100 hover:from-amber-200 hover:to-orange-200 text-[#8C2D19] text-xs font-bold rounded-xs flex items-center justify-between border border-orange-300/80 cursor-pointer transition-all shadow-2xs active:scale-[0.99]"
                          title="1人で全件巡回されるお寺向け: すべての日程・全檀家の担当を一発でこの僧侶に設定します"
                        >
                          <span className="flex items-center gap-1.5 truncate pr-1">
                            <UserCheck className="w-3.5 h-3.5 text-[#8C2D19] shrink-0" />
                            <span className="truncate">
                              【1人巡回用】全日程（全{tanagyoPatrons.length}軒）を一括割当
                            </span>
                          </span>
                          <span className="text-[9px] bg-white text-[#8C2D19] border border-orange-300 px-1.5 py-0.5 rounded-full shrink-0 font-black shadow-2xs">
                            全日程一括
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* 対象日程の檀信徒一覧 */}
                <div className="flex-1 flex flex-col min-h-0 border border-gray-200 rounded-xs overflow-hidden">
                  <div className="bg-gray-100 px-3 py-1.5 border-b border-gray-200 text-xs font-bold text-gray-700 flex justify-between items-center">
                    <span>
                      {step2FilterDate} の檀信徒（
                      {tanagyoPatrons.filter((h) => h.tanagyoDate === step2FilterDate).length} 軒）
                    </span>
                    {tanagyoPatrons.some(
                      (h) =>
                        h.tanagyoDate === step2FilterDate &&
                        (resolveAssignedPriest(h) || h.tanagyoPriestId || h.tanagyoPriestName)
                    ) && (
                      <button
                        type="button"
                        onClick={handleResetDatePriestAssignments}
                        className="text-[10px] text-red-600 hover:text-red-800 hover:underline flex items-center gap-1 cursor-pointer"
                        title="この日の担当僧侶割当をすべて解除して未定に戻します"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>担当を未定にリセット</span>
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-gray-100 text-xs">
                    {tanagyoPatrons
                      .filter((h) => h.tanagyoDate === step2FilterDate)
                      .map((h) => {
                        const assignedPriest = resolveAssignedPriest(h);
                        const priestName =
                          assignedPriest?.name || h.tanagyoPriestName || '未定';
                        const isAssigned = !!assignedPriest || Boolean(h.tanagyoPriestId || h.tanagyoPriestName);
                        const color = assignedPriest
                          ? getPriestColor(assignedPriest.id)
                          : getPriestColor(h.tanagyoPriestId || h.tanagyoPriestName);
                        const isSelected = selectedHouseholdId === h.id;
                        return (
                          <div
                            key={h.id}
                            onClick={() => handleFocusHouseholdOnMap(h)}
                            className={`p-2 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors ${
                              isSelected ? 'bg-amber-100/70 font-bold' : ''
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <div className="font-bold text-gray-800 truncate flex items-center gap-1.5">
                                <span>{getHouseholdSponsorName(h) || h.familyHead} 様</span>
                                {typeof h.latitude === 'number' && typeof h.longitude === 'number' && (
                                  <span
                                    className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded-2xs font-bold border border-emerald-300 shrink-0"
                                    title={`手動調整済み位置: (${h.latitude.toFixed(5)}, ${h.longitude.toFixed(5)})`}
                                  >
                                    📍確定
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-gray-500 truncate">
                                {h.tanagyoAddress || h.address}
                              </div>
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-1.5">
                              {isAssigned ? (
                                <div className="flex items-center gap-1">
                                  <span
                                    className="inline-block px-2 py-0.5 text-white text-[10px] font-bold rounded-xs shadow-2xs"
                                    style={{ backgroundColor: color }}
                                  >
                                    {priestName}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateHouseholdAssignment(h.id, {
                                        tanagyoPriestId: '',
                                        tanagyoPriestName: '',
                                      });
                                    }}
                                    className="p-1 text-gray-400 hover:text-red-600 rounded-xs hover:bg-red-50 cursor-pointer"
                                    title="この檀家の担当割当を解除して未定に戻す"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const priestObj = priests.find(
                                      (p) => p.id === step2SelectedPriestId
                                    );
                                    updateHouseholdAssignment(h.id, {
                                      tanagyoPriestId: step2SelectedPriestId,
                                      tanagyoPriestName: priestObj ? priestObj.name : '',
                                    });
                                  }}
                                  className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold rounded-xs border border-amber-300 cursor-pointer transition-colors"
                                >
                                  この僧侶を割当
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* ====== STEP 3: 巡回順序＆午前午後仕切りバー ====== */}
            {activeStep === 3 && (
              <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-3.5">
                <div className="border-b border-gray-200 pb-2">
                  <h4 className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1.5">
                    <ArrowUpDown className="w-4 h-4 text-[#8C2D19]" />
                    <span>ステップ3: 巡回順序 ＆ 午前／午後仕切り</span>
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">
                    回りたい順にピンをクリックして順番を決め、途中の【ここから午後】バーを動かして午前・午後を振り分けます。
                  </p>
                </div>

                {/* 絞り込み枠選択 */}
                <div className="bg-[#FAF7F0] p-2.5 border border-[#D4AF37]/60 rounded-xs space-y-1.5">
                  <div className="text-xs font-bold text-[#8C2D19] flex items-center gap-1">
                    <Navigation className="w-3.5 h-3.5" />
                    <span>巡回枠を選択:</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* 日程 */}
                    <div>
                      <span className="text-[10px] text-gray-500 block mb-0.5">日程</span>
                      <select
                        value={step3FilterDate}
                        onChange={(e) => setStep3FilterDate(e.target.value)}
                        className="w-full p-1.5 border border-gray-300 rounded-xs bg-white font-bold"
                      >
                        {datesList.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 担当僧侶 */}
                    <div>
                      <span className="text-[10px] text-gray-500 block mb-0.5">担当僧侶</span>
                      <select
                        value={step3FilterPriestId}
                        onChange={(e) => setStep3FilterPriestId(e.target.value)}
                        className="w-full p-1.5 border border-gray-300 rounded-xs bg-white font-bold"
                      >
                        {priests.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 連番採番モード切替 */}
                <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      <span>地図クリック連番採番モード</span>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        isNumberingMode
                          ? 'bg-red-600 text-white animate-pulse'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {isNumberingMode ? `採番中 (次: No.${nextOrderNum})` : '停止中'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-tight">
                    開始後、地図上のピンをクリックした順に No.1, No.2... と番号が振られ、ルート線が繋がります。
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsNumberingMode(true);
                        setNextOrderNum(1);
                      }}
                      className="flex-1 py-1.5 bg-[#8C2D19] hover:bg-[#702414] text-white font-bold text-xs rounded-xs cursor-pointer shadow-xs"
                    >
                      No.1から採番開始
                    </button>
                    <button
                      type="button"
                      onClick={handleAutoNormalizeOrder}
                      className="px-2.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-bold text-xs rounded-xs cursor-pointer"
                      title="現在の表示順序をそのまま No.1..N に確定し、午前午後も連動確定します"
                    >
                      採番を確定
                    </button>
                  </div>
                </div>

                {/* 巡回順序リスト ＆ 午前午後仕切りバー */}
                <div className="flex-1 flex flex-col min-h-0 border border-gray-200 rounded-xs overflow-hidden">
                  <div className="bg-gray-100 px-3 py-1.5 border-b border-gray-200 text-xs font-bold text-gray-700 flex justify-between items-center">
                    <span>
                      訪問順路一覧（{step3TargetHouseholds.length} 軒）
                    </span>
                    <button
                      type="button"
                      onClick={handleOpenGoogleMapsRoute}
                      className="text-[11px] text-blue-700 hover:text-blue-900 font-bold flex items-center gap-0.5 cursor-pointer"
                      title="Googleマップでこのルートを一括ナビ表示します"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Googleマップで開く
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-gray-100 text-xs">
                    {step3TargetHouseholds.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-xs">
                        この枠に割り当てられた檀家がありません。ステップ1および2で日程と担当を割り振ってください。
                      </div>
                    ) : (
                      step3TargetHouseholds.map((h, idx) => {
                        const sponsor = getHouseholdSponsorName(h) || h.familyHead;
                        const isAfternoon = idx >= afternoonStartIndex;
                        const isFirstAfternoon = idx === afternoonStartIndex;
                        const isSelected = selectedHouseholdId === h.id;

                        return (
                          <React.Fragment key={h.id}>
                            {/* ★★★ 午前／午後 仕切りバー ★★★ */}
                            {isFirstAfternoon && (
                              <div className="bg-amber-700 text-white px-3 py-1.5 flex items-center justify-between shadow-xs sticky top-0 z-10 font-bold text-xs border-y-2 border-amber-900">
                                <div className="flex items-center gap-1.5">
                                  <Moon className="w-4 h-4 text-amber-200" />
                                  <span>▼ ここから午後（PM）訪問</span>
                                </div>
                                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-mono">
                                  午後: {step3TargetHouseholds.length - idx}軒
                                </span>
                              </div>
                            )}

                            <div
                              onClick={() => handleFocusHouseholdOnMap(h)}
                              className={`p-2 flex items-center justify-between cursor-pointer hover:bg-gray-50 ${
                                isSelected
                                  ? 'bg-amber-100/70 font-bold ring-1 ring-amber-300'
                                  : isAfternoon
                                  ? 'bg-orange-50/30'
                                  : 'bg-blue-50/20'
                              }`}
                            >
                              <div className="flex items-center space-x-2 min-w-0 pr-2">
                                <span className={`w-5 h-5 rounded-full text-white font-black flex items-center justify-center text-[11px] shrink-0 ${isAfternoon ? 'bg-orange-600' : 'bg-blue-600'}`}>
                                  {h.tanagyoOrder || idx + 1}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-bold text-gray-800 truncate flex items-center gap-1">
                                    <span>{sponsor} 様</span>
                                    <span className={`text-[9px] px-1 py-0.2 rounded-2xs font-bold ${isAfternoon ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                                      {isAfternoon ? '午後' : '午前'}
                                    </span>
                                    {checkIsNiibon(h) && (
                                      <span className="text-[9px] text-red-600 font-bold bg-red-100 px-1 rounded-2xs">
                                        新盆
                                      </span>
                                    )}
                                    {typeof h.latitude === 'number' && typeof h.longitude === 'number' && (
                                      <span
                                        className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded-2xs font-bold border border-emerald-300 shrink-0"
                                        title={`手動調整済み位置: (${h.latitude.toFixed(5)}, ${h.longitude.toFixed(5)})`}
                                      >
                                        📍確定
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-gray-500 truncate">
                                    {h.tanagyoAddress || h.address}
                                  </div>
                                </div>
                              </div>

                              {/* 右側アクション: 仕切りバー移動ボタン ＆ 上下移動ボタン */}
                              <div
                                className="flex items-center space-x-1 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {!isFirstAfternoon && (
                                  <button
                                    type="button"
                                    onClick={() => handleSetAfternoonBoundary(idx)}
                                    className="px-1.5 py-0.5 text-[10px] bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-2xs cursor-pointer flex items-center gap-0.5"
                                    title="ここから下の順番を午後に設定します"
                                  >
                                    <MoveDown className="w-3 h-3 text-amber-700" />
                                    <span>ここから午後</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveOrder(h.id, 'up')}
                                  className="p-1 rounded-xs bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30 cursor-pointer text-xs"
                                  title="1つ上に移動"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === step3TargetHouseholds.length - 1}
                                  onClick={() => handleMoveOrder(h.id, 'down')}
                                  className="p-1 rounded-xs bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30 cursor-pointer text-xs"
                                  title="1つ下に移動"
                                >
                                  ▼
                                </button>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })
                    )}

                    {/* 全員午前の場合の「全員午前にする / 全員午後にする」クイック切り替え */}
                    {step3TargetHouseholds.length > 0 && afternoonStartIndex >= step3TargetHouseholds.length && (
                      <div className="p-2 bg-blue-50 text-center border-t border-blue-200">
                        <span className="text-[11px] text-blue-900 font-bold block mb-1">
                          現在は全員「☀️ 午前」に設定されています
                        </span>
                        <div className="flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSetAfternoonBoundary(Math.floor(step3TargetHouseholds.length / 2))}
                            className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded-xs cursor-pointer shadow-2xs"
                          >
                            中間から後半を午後に分割
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetAfternoonBoundary(0)}
                            className="px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white font-bold text-[10px] rounded-xs cursor-pointer shadow-2xs"
                          >
                            全員を午後にする
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* パネルフッター: どのステップでも保存終了可能なボタン群 */}
            <div className="p-3 bg-[#FAF7F0] border-t border-[#D1CEC7] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    if (activeStep > 1) {
                      setActiveStep((prev) => (prev - 1) as 1 | 2 | 3);
                    }
                  }}
                  disabled={activeStep === 1}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 disabled:opacity-40 font-bold text-xs rounded-xs cursor-pointer hover:bg-gray-300"
                >
                  ◀ 前のステップ
                </button>
                {hasChanges && (
                  <button
                    type="button"
                    onClick={handleDiscardAndClose}
                    className="px-2 py-1 text-gray-500 hover:text-red-700 hover:bg-red-50 text-xs font-medium rounded-xs cursor-pointer transition-colors"
                    title="編集した内容を保存せずに破棄して閉じます"
                  >
                    変更を破棄して閉じる
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {/* どのステップでもいつでも保存して終了できるボタン */}
                <button
                  type="button"
                  onClick={handleSaveAndApply}
                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xs cursor-pointer shadow-sm flex items-center gap-1.5 transition-colors"
                  title="ここまでの計画・割当を保存してモーダルを閉じます"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {activeStep === 3 ? '計画を確定・保存して終了' : 'ここまでの割当を保存して終了'}
                  </span>
                </button>

                {/* 次のステップへ進むボタン */}
                {activeStep < 3 && (
                  <button
                    type="button"
                    onClick={() => setActiveStep((prev) => (prev + 1) as 1 | 2 | 3)}
                    className="px-3.5 py-1.5 bg-[#8C2D19] text-white font-bold text-xs rounded-xs cursor-pointer hover:bg-[#702414] shadow-xs flex items-center gap-1 transition-colors"
                  >
                    <span>次へ進む</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 全割当リセットの確認モーダル */}
        {showResetConfirmModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xs shadow-2xl border-2 border-red-500 max-w-md w-full p-5 animate-in fade-in zoom-in-95">
              <div className="flex items-center gap-3 text-red-600 mb-3">
                <div className="p-2 bg-red-100 rounded-full">
                  <RotateCcw className="w-6 h-6 stroke-[2.5]" />
                </div>
                <h4 className="font-bold text-base text-gray-900">全割当を未割当にリセット</h4>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed mb-4">
                {selectedTempleFilter !== 'ALL'
                  ? `【${temples.find((t) => t.id === selectedTempleFilter)?.name || '選択中の寺院'}】`
                  : '【すべての寺院】'}
                の棚経割当情報（訪問日程・担当僧侶・時間帯・巡回順序）を解除し、未割当に戻します。
                <br />
                <span className="text-gray-500 mt-1 block">
                  ※檀家名簿自体の棚経対象設定は解除されません。
                  <br />
                  ※右下の「保存して終了」を押すまで確定されません。
                </span>
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowResetConfirmModal(false)}
                  className="px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100 border border-gray-300 rounded-xs cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleExecuteResetAll}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xs shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>未割当にリセットする</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
