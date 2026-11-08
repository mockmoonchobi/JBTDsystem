const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

global.window = {
  requestAnimationFrame: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  document: { body: {} },
};
global.document = { body: {} };

try {
  require.cache[require.resolve('leaflet')] = { exports: {} };
} catch (_) {}

require.extensions['.ts'] = (m, p) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(p, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    p
  );

require.extensions['.tsx'] = (m, p) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(p, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText,
    p
  );

const { isHojiService, getServiceTobaSponsors } = require('../src/components/DaySchedulePrintModal.tsx');
const { parseSingleTobaLine } = require('../src/components/ReservationCalendarManager.tsx');

test('isHojiService properly filters for memorial services (法事のみ)', () => {
  // Memorial services (法事)
  assert.equal(isHojiService({ memorialType: '一周忌' }), true);
  assert.equal(isHojiService({ memorialType: '三回忌' }), true);
  assert.equal(isHojiService({ memorialType: '七回忌' }), true);
  assert.equal(isHojiService({ memorialType: '四十九日' }), true);
  assert.equal(isHojiService({ memorialType: '年忌法要' }), true);
  assert.equal(isHojiService({ memorialType: '納骨法要' }), true);
  assert.equal(isHojiService({ memorialType: '命日法要' }), true);
  assert.equal(isHojiService({ memorialType: 'その他', dharmaName: '慈光院妙華信女' }), true);

  // Non-hoji services (funerals, temple events, meetings, personal tasks, etc.)
  assert.equal(isHojiService({ memorialType: '通夜' }), false);
  assert.equal(isHojiService({ memorialType: '葬儀' }), false);
  assert.equal(isHojiService({ memorialType: '枕経' }), false);
  assert.equal(isHojiService({ memorialType: '通夜・葬儀' }), false);
  assert.equal(isHojiService({ memorialType: '寺院行事' }), false);
  assert.equal(isHojiService({ memorialType: '他寺院助法・出向' }), false);
  assert.equal(isHojiService({ memorialType: '会議・教区・公務' }), false);
  assert.equal(isHojiService({ memorialType: '住職個人用務・私用' }), false);
  assert.equal(isHojiService({ memorialType: '地域行事' }), false);
  assert.equal(isHojiService({ memorialType: '来客・相談' }), false);
  assert.equal(isHojiService({ memorialType: '棚経' }), false);
  assert.equal(isHojiService({ memorialType: '月参り' }), false);
  assert.equal(isHojiService({ memorialType: '塔婆供養' }), false);
  assert.equal(isHojiService({ memorialType: '塔婆' }), false);
  assert.equal(isHojiService({ memorialType: 'その他' }), false); // without spirit info
});

test('parseSingleTobaLine extracts sponsorName and formats accurately', () => {
  const line1 = '慈光院妙華信女 一周忌 志主 佐藤 太郎';
  const res1 = parseSingleTobaLine(line1);
  assert.equal(res1.sponsorName, '佐藤 太郎');
  assert.equal(res1.memorialType, '一周忌');
  assert.equal(res1.dharmaName, '慈光院妙華信女');

  const line2 = '1. 〇〇居士 三回忌 志主 田中次郎様';
  const res2 = parseSingleTobaLine(line2);
  assert.equal(res2.sponsorName, '田中次郎');

  const line3 = '志主 佐藤三郎 〇〇信女 七回忌';
  const res3 = parseSingleTobaLine(line3);
  assert.equal(res3.sponsorName, '佐藤三郎');
});

test('getServiceTobaSponsors extracts ALL sponsors when multiple sponsors apply for toba', () => {
  // Case 1: Multiple sponsors in tobaItems
  const serviceWithItems = {
    id: 's-1',
    memorialType: '一周忌',
    chiefMourner: '佐藤 太郎',
    tobaCount: 3,
    tobaItems: [
      { id: '1', sponsorName: '佐藤 太郎', memorialType: '一周忌', dharmaName: '慈光院妙華信女' },
      { id: '2', sponsorName: '佐藤 次郎', memorialType: '一周忌', dharmaName: '慈光院妙華信女' },
      { id: '3', sponsorName: '鈴木 花子', memorialType: '一周忌', dharmaName: '慈光院妙華信女' },
    ],
  };

  const sponsors1 = getServiceTobaSponsors(serviceWithItems, [], [], []);
  assert.deepEqual(sponsors1, ['佐藤　太郎様', '佐藤　次郎様', '鈴木　花子様']);

  // Case 2: Multiple sponsors in tobaSponsors array
  const serviceWithSponsors = {
    id: 's-2',
    memorialType: '三回忌',
    chiefMourner: '山田 一郎',
    tobaCount: 2,
    tobaSponsors: ['山田 一郎', '高橋 次郎'],
  };

  const sponsors2 = getServiceTobaSponsors(serviceWithSponsors, [], [], []);
  assert.deepEqual(sponsors2, ['山田　一郎様', '高橋　次郎様']);

  // Case 3: Delimited sponsors e.g. "佐藤太郎、佐藤次郎"
  const serviceWithDelimited = {
    id: 's-3',
    memorialType: '七回忌',
    chiefMourner: '佐藤 太郎',
    tobaCount: 2,
    tobaSponsors: ['佐藤 太郎、佐藤 次郎'],
  };

  const sponsors3 = getServiceTobaSponsors(serviceWithDelimited, [], [], []);
  assert.deepEqual(sponsors3, ['佐藤　太郎様', '佐藤　次郎様']);

  // Case 4: Matched Todo with multiple toba detail lines
  const serviceWithTodo = {
    id: 's-4',
    householdId: 'h-1',
    scheduledDate: '2026/09/11',
    memorialType: '一周忌',
    chiefMourner: '中村 太郎',
    tobaCount: 2,
  };
  const matchedTodo = {
    id: 'todo-1',
    category: '塔婆',
    relatedServiceId: 's-4',
    dueDate: '2026/09/11',
    title: '【塔婆作成】中村太郎様',
    notes: '【塔婆明細】\n慈光院妙華信女 一周忌 志主 中村太郎\n慈光院妙華信女 一周忌 志主 中村次郎',
  };

  const sponsors4 = getServiceTobaSponsors(serviceWithTodo, [], [matchedTodo], [serviceWithTodo]);
  assert.deepEqual(sponsors4, ['中村太郎様', '中村次郎様']);

  // Case 5: No toba requested -> empty sponsors list
  const serviceWithoutToba = {
    id: 's-5',
    memorialType: '一周忌',
    chiefMourner: '佐藤 太郎',
    tobaCount: 0,
  };
  const sponsors5 = getServiceTobaSponsors(serviceWithoutToba, [], [], []);
  assert.deepEqual(sponsors5, []);
});
