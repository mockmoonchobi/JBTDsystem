export type HouseholdType = string;
export type HouseholdStatus = string;

export interface TobaApplicationItem {
  applied: boolean;
  tamegaki?: string;
}

export interface FamilyMember {
  id: string;
  householdId: string;
  name: string;
  furigana?: string;
  relationship: string;
  phone?: string;
  address?: string;
  isChiefMourner?: boolean; // 施主フラグ（別居子息等が施主の場合）
  isSponsor?: boolean; // 施主フラグ（同義・互換用）
  isSegakiToba?: boolean; // 後方互換用（施餓鬼塔婆 = 塔婆申込１）
  segakiTamegaki?: string; // 後方互換用（施餓鬼塔婆 為書き = 塔婆申込１為書き）
  toba1Applied?: boolean; // 塔婆申込１
  toba1Tamegaki?: string; // 塔婆申込１ 為書き
  toba2Applied?: boolean; // 塔婆申込２
  toba2Tamegaki?: string; // 塔婆申込２ 為書き
  toba3Applied?: boolean; // 塔婆申込３
  toba3Tamegaki?: string; // 塔婆申込３ 為書き
  tobaApplications?: Record<string, TobaApplicationItem>; // 塔婆申込種類別（例: '施餓鬼塔婆', '彼岸塔婆', '合同供養'）
  fee1Amount?: number; // 集金１ 金額
  fee2Amount?: number; // 集金２ 金額
  fee3Amount?: number; // 集金３ 金額
  fee1?: number | string; // 集金１ 互換用
  fee2?: number | string; // 集金２ 互換用
  fee3?: number | string; // 集金３ 互換用
  notes?: string;
  // 監査フィールド (作成日・作成時間・修正日・修正時間)
  createdDate?: string;
  createdTime?: string;
  updatedDate?: string;
  updatedTime?: string;
}

export interface Household {
  id: string;
  templeId?: string; // 所属寺院ID（兼務寺院管理用）
  familyHead: string;
  furigana: string;
  postalCode: string;
  address: string;
  phone: string;
  mobile?: string;
  email?: string;
  householdType: HouseholdType;
  district: string;
  tombNumber: string;
  qrToken?: string;
  status: HouseholdStatus;
  notes?: string;
  familyMembers: FamilyMember[];
  isSegakiToba?: boolean; // 後方互換用（施餓鬼塔婆 = 塔婆申込１）
  segakiTamegaki?: string; // 後方互換用（施餓鬼塔婆 為書き = 塔婆申込１為書き）
  toba1Applied?: boolean; // 塔婆申込１
  toba1Tamegaki?: string; // 塔婆申込１ 為書き
  toba2Applied?: boolean; // 塔婆申込２
  toba2Tamegaki?: string; // 塔婆申込２ 為書き
  toba3Applied?: boolean; // 塔婆申込３
  toba3Tamegaki?: string; // 塔婆申込３ 為書き
  tobaApplications?: Record<string, TobaApplicationItem>; // 塔婆申込種類別（例: '施餓鬼塔婆', '彼岸塔婆', '合同供養'）
  fee1Amount?: number; // 集金１ 金額（個別設定時）
  fee2Amount?: number; // 集金２ 金額（個別設定時）
  fee3Amount?: number; // 集金３ 金額（個別設定時）
  fee1?: number | string; // 集金１ 互換用
  fee2?: number | string; // 集金２ 互換用
  fee3?: number | string; // 集金３ 互換用
  tanagyoMonthlyVisit?: boolean;
  tanagyoAddress?: string;
  tanagyoNotes?: string;
  tanagyoDate?: string; // 訪問日 (例: "8/13", "8/14")
  tanagyoTimeSlot?: '午前' | '午後' | '' | string; // 午前 / 午後
  tanagyoPriestId?: string; // 担当僧侶ID
  tanagyoPriestName?: string; // 担当僧侶名
  tanagyoOrder?: number; // 訪問順序
  createdAt: string;
  // 監査フィールド (作成日・作成時間・修正日・修正時間)
  createdDate?: string;
  createdTime?: string;
  updatedDate?: string;
  updatedTime?: string;
}

export interface PastRecord {
  id: string;
  templeId?: string; // 所属寺院ID（兼務寺院管理用）
  householdId: string;
  householdHeadName: string;
  dharmaName: string; // 戒名/法名
  secularName: string; // 俗名
  deathDate: string; // YYYY-MM-DD
  ageAtDeath?: number; // 享年/行年（未入力時は空欄/undefined）
  relationship: string; // 戸主との関係
  burialLocation: string; // 納骨・墓地位置
  niibon?: string; // 新盆（例: 令和8年新盆 または 空欄/手動設定値）
  notes?: string;
  // 監査フィールド (作成日・作成時間・修正日・修正時間)
  createdDate?: string;
  createdTime?: string;
  updatedDate?: string;
  updatedTime?: string;
  createdAt?: string;
  updatedAt?: string;
  // 互換・インポート用補助プロパティ
  deceasedName?: string;
  furigana?: string;
  age?: number;
  chiefMourner?: string;
  tombNumber?: string;
}

export type MemorialMilestoneType = 
  | '初七日'
  | '四十九日'
  | '百カ日'
  | '一周忌'
  | '三回忌'
  | '七回忌'
  | '十三回忌'
  | '十七回忌'
  | '二十三回忌'
  | '二十七回忌'
  | '三十三回忌'
  | '五十回忌'
  | '百回忌'
  | '二百回忌'
  | '三百回忌'
  | '四百回忌'
  | '五百回忌'
  | '六百回忌'
  | '七百回忌'
  | '八百回忌'
  | '九百回忌'
  | '千回忌'
  | string;

export interface MemorialMilestone {
  type: MemorialMilestoneType;
  yearNumber: number; // e.g. 1, 3, 7, 13...
  targetYear: number;
  scheduledDate: string; // YYYY-MM-DD
  japaneseEra: string;
  isPast: boolean;
  isCurrentYear: boolean;
  isNextYear: boolean;
}

export type MemorialStatus = '法要前' | '未入金' | '入金済' | '案内送付済' | '出席' | '欠席' | '完了';

export type ReservationCategory =
  | '年忌法要'
  | '納骨法要'
  | '塔婆供養'
  | '塔婆依頼'
  | '棚経'
  | '枕経'
  | '通夜'
  | '葬儀'
  | '枕経・通夜・葬儀'
  | '月参り'
  | '祈祷・厄除'
  | '寺院行事'
  | '他寺院助法・出向'
  | '会議・教区・公務'
  | '住職個人用務・私用'
  | '地域行事'
  | '来客・相談'
  | 'その他';

export interface ServiceDeceasedTarget {
  id?: string; // pastRecordId
  deceasedName?: string; // 俗名
  dharmaName?: string; // 戒名・法名
  memorialType?: string; // 回忌（例: 一周忌、七回忌、年忌法要）
  deathDate?: string; // 命日
  isMain?: boolean; // メイン精霊フラグ
  notes?: string;
}

export interface ServiceTobaItem {
  id: string;
  sponsorName: string; // 志主名
  memorialType?: string; // 回忌（例: 一周忌、七回忌）
  dharmaName?: string; // 戒名/法名（あるいは為書き）
  secularName?: string; // 俗名
  tamegaki?: string; // 為書き（例: 〇〇家先祖代々、為 俗名〇〇）
  tobaType?: string; // 大塔婆、中塔婆等
  fee?: number; // 塔婆料
}

export interface MemorialService {
  id: string;
  templeId?: string; // 所属寺院ID（兼務寺院管理用）
  householdId: string;
  deceasedId: string;
  deceasedName: string;
  dharmaName: string;
  memorialType: MemorialMilestoneType | '命日法要' | '彼岸会' | '盆法要' | '特別法要' | ReservationCategory;
  additionalDeceased?: ServiceDeceasedTarget[]; // 複数精霊（併修・合修）供養情報
  scheduledDate: string; // YYYY/MM/DD or YYYY-MM-DD
  scheduledTime: string; // HH:mm or '終日'
  endTime?: string; // HH:mm or '終日'
  isAllDay?: boolean; // 終日フラグ
  venue: string; // 本堂, 客殿, 墓前, 自宅, 斎場, etc.
  address?: string; // 訪問先住所 (棚経・自宅法要用)
  status: MemorialStatus;
  chiefMourner: string; // 施主名
  attendeeCount: number;
  offeringAmount: number; // 布施金額
  tobaCount?: number; // 塔婆本数
  tobaFee?: number; // 塔婆料 (円)
  tobaType?: string; // 塔婆種別 (尺/サイズ/種別)
  tobaSponsors?: string[]; // 塔婆志主名一覧 (1本目: 施主名等)
  tobaItems?: ServiceTobaItem[]; // 塔婆個別明細（志主・回忌・戒名/為書き等）
  noticeText?: string;
  notes?: string;
  receptionCheckedIn: boolean;
  receptionTime?: string;
  // 会計連携フィールド
  accountingRecorded?: boolean; // 出納帳に記帳済みか
  transactionId?: string; // 紐づく出納ID (TX-xxx)
  isCompleted?: boolean;
  // 監査フィールド (作成日・作成時間・修正日・修正時間)
  createdDate?: string;
  createdTime?: string;
  updatedDate?: string;
  updatedTime?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type TodoPriority = 'high' | 'medium' | 'low' | 'urgent';
export type TodoCategory = '法要準備' | '塔婆揮毫' | '塔婆準備' | '案内発送' | '境内整備' | '会計処理' | '棚経準備' | '法事' | 'その他' | string;

export interface TempleTodo {
  id: string;
  templeId?: string; // 所属寺院ID（兼務寺院管理用）
  title: string;
  dueDate: string; // YYYY/MM/DD
  dueTime?: string;
  priority: TodoPriority;
  category: TodoCategory;
  completed: boolean;
  completedAt?: string;
  relatedServiceId?: string; // 関連する予約・法要ID
  serviceId?: string; // 互換プロパティ
  householdId?: string;
  householdHeadName?: string;
  contactName?: string; // 互換プロパティ
  notes?: string;
  createdAt: string;
  // 監査フィールド (作成日・作成時間・修正日・修正時間)
  createdDate?: string;
  createdTime?: string;
  updatedDate?: string;
  updatedTime?: string;
  updatedAt?: string;
}

export type TransactionCategory = 
  | '法要布施' 
  | '護持会費' 
  | '墓地管理費' 
  | '開眼・納骨布施' 
  | '特別寄付' 
  | '年間維持費'
  | '境内整備費'
  | '修繕経費'
  | '繰越金'
  | '前期繰越'
  | '前期繰越金'
  | 'その他'
  | string;

export interface Transaction {
  id: string;
  templeId?: string; // 所属寺院ID（兼務寺院管理用）
  date: string;
  householdId?: string;
  householdHeadName?: string;
  category: TransactionCategory;
  type: '収入' | '支出';
  amount: number;
  paymentMethod: '現金受付' | 'QR受付時' | '銀行振込' | '郵便振替' | 'その他' | string;
  receiptNumber: string;
  relatedServiceId?: string; // 関連する法事・法要ID
  description?: string; // 互換プロパティ
  notes?: string;
  // 監査フィールド (作成日・作成時間・修正日・修正時間)
  createdDate?: string;
  createdTime?: string;
  updatedDate?: string;
  updatedTime?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TempleAnnualEvent {
  id: string;
  month: number; // 1〜12月
  name: string; // 行事名 (例: 修正会, 春季彼岸会, 施餓鬼会, お盆法要, 報恩講, 成道会, 除夜会)
  dateDesc: string; // 日程 (例: 1月1日〜3日, 3月20日前後, 8月15日)
  description?: string; // 備考・詳細
}

export interface TempleInfo {
  id?: string;
  name: string;
  shortName?: string; // 略称（例: 圓福寺）
  sect: string; // 宗派 (例: 曹洞宗, 浄土真宗, 臨済宗, 真言宗, 日蓮宗, 浄土宗)
  mountainName: string; // 山号 (例: 慈光山)
  chiefPriest: string; // 住職名
  postalCode: string;
  address: string;
  phone: string;
  fax?: string;
  website?: string; // 寺院公式ホームページ (URL)
  websiteUrl?: string; // 互換プロパティ
  bankInfo?: string;
  bonSeason?: '7月盆' | '8月盆'; // お盆の時期 (7月盆 / 8月盆)
  accountingMode?: 'individual' | 'combined'; // 会計処理方法 ('individual': 各寺院個別, 'combined': 全寺院合算)
  fiscalYearStartMonth?: number; // 会計年度開始月 (1〜12, デフォルト: 4)
  fiscalYearStartDay?: number;   // 会計年度開始日 (1〜31, デフォルト: 1)
  fiscalYearEndMonth?: number;   // 会計年度終了月 (1〜12, デフォルト: 3)
  fiscalYearEndDay?: number;     // 会計年度終了日 (1〜31, デフォルト: 31)
  tobaType1?: string; // 塔婆申込１（デフォルト: '施餓鬼塔婆'）
  tobaType2?: string; // 塔婆申込２（任意）
  tobaType3?: string; // 塔婆申込３（任意）
  feeType1?: string; // 集金項目１（任意: 例: 護持会費、墓地管理費）
  feeType1Category?: string; // 集金項目１の対応勘定科目（例: 護持会費、法要布施）
  feeType1DefaultAmount?: number; // 集金項目１の標準金額（例: 5000）
  feeType2?: string; // 集金項目２（任意: 例: 墓地管理費）
  feeType2Category?: string; // 集金項目２の対応勘定科目
  feeType2DefaultAmount?: number; // 集金項目２の標準金額
  feeType3?: string; // 集金項目３（任意: 例: 境内整備費）
  feeType3Category?: string; // 集金項目３の対応勘定科目
  feeType3DefaultAmount?: number; // 集金項目３の標準金額
  feeTypeMapping?: Record<string, string>; // 集金項目名称 -> 勘定科目のマッピング辞書
  annualEvents?: TempleAnnualEvent[]; // 寺院年間行事
  annualEventsNotes?: string; // 年間行事に関する特記・備考
  isMain?: boolean; // 本寺（自寺・本坊）フラグ
  isAffiliated?: boolean; // 兼務寺フラグ
  color?: string; // 識別カラーバッジ (例: '#D4AF37', '#1A4D2E', '#1F4E79')
  masterOptions?: MasterOptions; // 寺院固有の区分・勘定科目マスタ
  createdAt?: string; // 作成日時 (ISOまたは文字列)
  updatedAt?: string; // 更新日時 (ISOまたは文字列)
  createdDate?: string;
  createdTime?: string;
  updatedDate?: string;
  updatedTime?: string;
}

export type TempleProfile = TempleInfo;

export interface Priest {
  id: string;
  name: string; // 僧侶名 (例: 智山 真福, 智山 福徳)
  furigana?: string; // フリガナ (例: ヒロセ ソウトク)
  role: string; // 役職・区分 (例: 本寺住職, 兼務寺住職, 住職, 副住職, 助法僧侶, 衆僧, 随身, 客僧, その他)
  templeId?: string; // 所属寺院ID (temple-main, temple-sub-0, または external 等)
  templeName?: string; // 所属寺院名 (例: 慈光山 圓福寺, 宝蔵寺, 大乗寺 など)
  phone?: string; // 電話番号
  email?: string; // メールアドレス
  notes?: string; // 備考・特記事項（得意分野、助法謝礼目安、連絡先など）
  isAutoChief?: boolean; // 住職から自動同期されるフラグ
  isMainChief?: boolean; // 本寺住職フラグ
}

export interface MasterOptions {
  householdTypes: string[]; // 区分1 (檀家区分)
  statuses: string[];       // 区分2 (状態区分)
  districts: string[];      // 世話人担当地区
  tobaTypes?: string[];     // 塔婆申込種類マスタ (例: ['施餓鬼塔婆', '彼岸塔婆', '合同供養'])
  feeTypes?: string[];      // 集金種類マスタ (例: ['護寺会費', '墓地管理費', '境内整備費'])
  incomeCategories?: string[]; // 収入の部 (勘定科目)
  expenseCategories?: string[]; // 支出の部 (勘定科目)
  accountingCategories?: string[]; // 財務管理の勘定科目(後方互換用)
  paymentMethods?: string[]; // 決済方法マスタ
  feeTypeMapping?: Record<string, string>; // 集金項目 -> 勘定科目マッピング
}

export interface NoticeTemplate {
  id: string;
  title: string;
  type: 'higan' | 'niibon' | 'general';
  content: string;
  isDefault?: boolean;
}

export interface NoticeTemplatesConfig {
  higan: string;
  niibon: string;
  springHigan?: string;
  autumnHigan?: string;
}

export interface PrintSettings {
  docType: 'envelope' | 'postcard';
  orientation: 'vertical' | 'horizontal';
  showPostalBox: boolean;
  postalCodeOffsetTop: number;
  postalCodeOffsetLeft: number;
  senderName: string;
  senderAddress: string;
  senderPostalCode: string;
  senderPhone: string;
  customMessage?: string;
  selectedHouseholdIds: string[];
}

export interface AppSnapshot {
  description: string;
  timestamp: number;
  households: Household[];
  pastRecords: PastRecord[];
  transactions: Transaction[];
  memorialServices: MemorialService[];
  templeTodos?: TempleTodo[];
  priests?: Priest[];
  deletedRecords?: DeletedRecordEntry[];
  templeInfo: TempleInfo;
  temples?: TempleProfile[];
  activeTempleId?: string;
  masterOptions: MasterOptions;
  templeMasterOptionsMap?: Record<string, MasterOptions>;
  selectedIdsForPrint: string[];
  householdSortKey?: string;
  householdSortOrder?: 'asc' | 'desc';
  excludedHouseholdIds?: string[];
  batchAccountingData?: BatchAccountingData;
}

export interface BatchAccountingConfig {
  id?: string;
  configDate: string; // 受付日付
  cat1: string; // 科目1
  notes1: string; // 摘要1
  defaultAmount1: number | ''; // 基準金額1
  cat2: string; // 科目2
  notes2: string; // 摘要2
  defaultAmount2: number | ''; // 基準金額2
  cat3: string; // 科目3
  notes3: string; // 摘要3
  defaultAmount3: number | ''; // 基準金額3
  appliedPreset?: string; // 適用プリセット ('temple_fees' | 'segaki' | 'higan' | 'custom' | string)
  templeId?: string; // 所属寺院ID
  lastSavedAt?: string; // 最終保存日時
}

export interface HouseholdBatchEntry {
  householdId: string;
  check1: boolean;
  amount1: number | '';
  check2: boolean;
  amount2: number | '';
  check3: boolean;
  amount3: number | '';
  notes?: string;
  updatedAt?: string;
}

export interface BatchAccountingData extends BatchAccountingConfig {
  entries: Record<string, HouseholdBatchEntry>; // 世帯別受付入力情報
}

export type DeletedEntityType = 
  | 'household'
  | 'pastRecord'
  | 'memorialService'
  | 'todo'
  | 'templeTodo'
  | 'transaction'
  | 'temple'
  | 'familyMember'
  | 'priest';

export interface DeletedRecordEntry {
  logId?: string; // 一意の履歴ID (例: "LOG-1725350000000-0", "LOG-1")
  id: string; // 対象レコードID (例: "1", "PR-123", "MS-456")
  entityType: DeletedEntityType;
  deletedAt: string; // ISO形式 (例: "2026-08-22T10:15:30.000Z")
  deletedTimestamp: number; // UNIX ms タイムスタンプ
  label?: string; // 表示名称 (例: "世帯 佐藤 太郎 (1)", "過去帳 釋浄信")
  templeId?: string; // 寺院ID
  actionType?: 'create' | 'update' | 'delete' | 'undo' | 'batch_delete' | 'batch_create' | 'wipe';
  operator?: string; // 操作ユーザー (例: "chief@renge.org", "スタッフ")
  deviceInfo?: string; // 操作端末 (例: "PC", "スマホ(スタッフ)", "スマホ")
}

export interface ActionHistoryEntry {
  id: string;
  actionType: 'delete' | 'insert' | 'update' | 'undo' | 'redo' | 'import' | 'reset';
  entityType?: DeletedEntityType | 'general';
  targetId?: string;
  description: string;
  timestamp: number;
  dateIso: string;
  templeId?: string;
}

export interface DisasterMemorialEvent {
  id: string; // 一意のID (例: "disaster-1", "disaster-2")
  date: string; // 命日・発生日 (例: "1923/09/01", "2011/03/11", "1945/08/15")
  name: string; // 対象名称 (例: "東日本大震災物故者精霊", "関東大震災物故者精霊")
  notes?: string; // 備考・由来メモ
  createdDate?: string;
  createdTime?: string;
  updatedDate?: string;
  updatedTime?: string;
}

