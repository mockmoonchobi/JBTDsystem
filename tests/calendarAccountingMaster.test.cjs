const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

test('accounting from schedule details resolves temple-specific payment methods and categories', () => {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/components/ReservationCalendarManager.tsx'), 'utf8');

  // Extract the helper functions from the component
  const getTempleMasterOptionsIndex = source.indexOf('  // 所属寺院IDの解決（兼務寺院の檀家・過去帳情報、または指定寺院IDから正確に解決）');
  const getTodoTempleInfoIndex = source.indexOf('  const getServiceMapSearchQuery =');
  const helperBlock = source.slice(source.indexOf('  const isAffiliatedTempleService ='), getTodoTempleInfoIndex);
  const accountingBlock = source.slice(getTempleMasterOptionsIndex, source.indexOf('  // Dynamic Accounting Modal State'));

  const context = {
    temples: [
      { id: 'temple-main', name: '本寺 萬徳寺', isMain: true },
      { id: 'temple-sub-1', name: '兼務寺 泉蔵院', isMain: false },
    ],
    templeInfo: { id: 'temple-main', name: '本寺 萬徳寺' },
    activeTempleId: 'ALL',
    households: [
      { id: 'HH-001', templeId: 'temple-main', familyHead: '山田 太郎' },
      { id: 'HH-002', templeId: 'temple-sub-1', familyHead: '佐藤 次郎' },
    ],
    pastRecords: [],
    memorialServices: [],
    masterOptions: {
      paymentMethods: ['現金受付', 'QR受付時', '銀行振込'],
      incomeCategories: ['護持会費', '法要布施'],
    },
    templeMasterOptionsMap: {
      'temple-main': {
        paymentMethods: ['本寺現金手渡し', '本寺口座振込'],
        incomeCategories: ['本寺法要布施', '本寺塔婆料'],
      },
      'temple-sub-1': {
        paymentMethods: ['兼務寺手渡し', 'ゆうちょ振替', 'PayPay送金'],
        incomeCategories: ['兼務寺供養料', '兼務寺お布施'],
      },
    },
    INITIAL_MASTER_OPTIONS: {
      paymentMethods: ['現金受付', 'その他'],
    },
    getTempleMasterOptions: (templeId, templeMasterOptionsMap, temples, masterOptions) => {
      if (templeMasterOptionsMap && templeMasterOptionsMap[templeId]) {
        return templeMasterOptionsMap[templeId];
      }
      return masterOptions;
    },
  };

  vm.createContext(context);
  const code = ts.transpileModule(
    helperBlock + '\n' + accountingBlock + `
    globalThis.getServiceResolvedTempleId = getServiceResolvedTempleId;
    globalThis.getPaymentMethodsForService = getPaymentMethodsForService;
    globalThis.getIncomeCategoriesForService = getIncomeCategoriesForService;
    `,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText;

  vm.runInContext(code, context);

  // Test 1: Service directly with temple-main
  const mainService = { id: 'SRV-1', templeId: 'temple-main', chiefMourner: '山田 太郎' };
  assert.equal(context.getServiceResolvedTempleId(mainService), 'temple-main');
  const mainMethods = context.getPaymentMethodsForService(mainService);
  assert.deepEqual(mainMethods, ['本寺現金手渡し', '本寺口座振込']);
  const mainCats = context.getIncomeCategoriesForService(mainService);
  assert.ok(mainCats.includes('本寺法要布施'));

  // Test 2: Service with household belonging to branch temple (temple-sub-1)
  const subServiceViaHousehold = { id: 'SRV-2', householdId: 'HH-002', chiefMourner: '佐藤 次郎' };
  assert.equal(context.getServiceResolvedTempleId(subServiceViaHousehold), 'temple-sub-1');
  const subMethods = context.getPaymentMethodsForService(subServiceViaHousehold);
  assert.deepEqual(subMethods, ['兼務寺手渡し', 'ゆうちょ振替', 'PayPay送金']);
  const subCats = context.getIncomeCategoriesForService(subServiceViaHousehold);
  assert.ok(subCats.includes('兼務寺供養料'));

  // Test 3: Fallback when temple has no custom paymentMethods
  context.templeMasterOptionsMap['temple-empty'] = { paymentMethods: [] };
  const emptyTempleService = { id: 'SRV-3', templeId: 'temple-empty' };
  const fallbackMethods = context.getPaymentMethodsForService(emptyTempleService);
  // Falls back to global masterOptions paymentMethods
  assert.deepEqual(fallbackMethods, ['現金受付', 'QR受付時', '銀行振込']);
});
