export interface KamonItem {
  id: string;
  name: string;
  category: string;
  description: string;
  svgPath: string; // SVG path or SVG markup snippet
}

export const KAMON_LIST: KamonItem[] = [
  {
    id: 'maruni-daki-myoga',
    name: '丸に抱き茗荷',
    category: '植物紋',
    description: '冥加に通じる縁起の良い家紋。日本の三大家紋の一つ。',
    svgPath: 'M12 2A10 10 0 1 0 22 12 A10 10 0 0 0 12 2 Z M12 4 A8 8 0 1 1 4 12 A8 8 0 0 1 12 4 Z M9 8 C8 10 8 14 10 16 C10.5 14 11 11 10 8 Z M15 8 C16 10 16 14 14 16 C13.5 14 13 11 14 8 Z',
  },
  {
    id: 'maruni-chigai-takanoha',
    name: '丸に違い鷹の羽',
    category: '武家・鳥紋',
    description: '威厳と勇猛を象徴する鷹の羽を交差させた人気家紋。',
    svgPath: 'M12 2A10 10 0 1 0 22 12 A10 10 0 0 0 12 2 Z M6 18 L18 6 M6 6 L18 18',
  },
  {
    id: 'maruni-tachibana',
    name: '丸に橘',
    category: '植物紋',
    description: '長寿・子孫繁栄の果実を表す伝統的な十大家紋。',
    svgPath: 'M12 2A10 10 0 1 0 22 12 A10 10 0 0 0 12 2 Z M12 6 A3 3 0 1 0 15 9 A3 3 0 0 0 12 6 Z M8 14 A2.5 2.5 0 1 0 10.5 16.5 A2.5 2.5 0 0 0 8 14 Z',
  },
  {
    id: 'gosan-no-kiri',
    name: '五三桐',
    category: '皇室・尊貴紋',
    description: '鳳凰が止まる聖木。格式高く寺院でも重用される名門紋。',
    svgPath: 'M12 4 L12 12 M8 7 L8 14 M16 7 L16 14 M4 16 C8 14 16 14 20 16',
  },
  {
    id: 'mitsu-uroko',
    name: '三つ鱗',
    category: '図形紋',
    description: '北条氏で有名な三つの正三角形で蛇や竜の鱗をかたどる。',
    svgPath: 'M12 3 L18 11 L6 11 Z M6 12 L12 20 L0 20 Z M18 12 L24 20 L12 20 Z',
  },
  {
    id: 'maruni-sasa-rindou',
    name: '丸に笹竜胆',
    category: '草花紋',
    description: '清和源氏ゆかりの気品ある草花紋。高貴と気品を意味する。',
    svgPath: 'M12 2A10 10 0 1 0 22 12 A10 10 0 0 0 12 2 Z M12 7 C10 10 10 14 12 17 C14 14 14 10 12 7 Z',
  },
  {
    id: 'maruni-ken-katabami',
    name: '丸に剣片喰',
    category: '草花・武者紋',
    description: '繁殖力の強い片喰（カタバミ）に剣をあしらった子孫繁栄紋。',
    svgPath: 'M12 2A10 10 0 1 0 22 12 A10 10 0 0 0 12 2 Z M12 6 L12 18 M6 12 L18 12',
  },
  {
    id: 'kuyou',
    name: '九曜',
    category: '星辰紋',
    description: '中央の星を八つの星が囲む厄除け・加護の星座紋。',
    svgPath: 'M12 12 m-2.5,0 a2.5,2.5 0 1,0 5,0 a2.5,2.5 0 1,0 -5,0 M12 4 m-1.5,0 a1.5,1.5 0 1,0 3,0 a1.5,1.5 0 1,0 -3,0 M12 20 m-1.5,0 a1.5,1.5 0 1,0 3,0 a1.5,1.5 0 1,0 -3,0 M4 12 m-1.5,0 a1.5,1.5 0 1,0 3,0 a1.5,1.5 0 1,0 -3,0 M20 12 m-1.5,0 a1.5,1.5 0 1,0 3,0 a1.5,1.5 0 1,0 -3,0',
  },
  {
    id: 'maruni-umebachi',
    name: '丸に梅鉢',
    category: '天満宮・花紋',
    description: '菅原道真ゆかりの学問と天満宮のシンボル。',
    svgPath: 'M12 2A10 10 0 1 0 22 12 A10 10 0 0 0 12 2 Z M12 8 a2,2 0 1,0 0.001,0 M8 11 a2,2 0 1,0 0.001,0 M16 11 a2,2 0 1,0 0.001,0 M9.5 16 a2,2 0 1,0 0.001,0 M14.5 16 a2,2 0 1,0 0.001,0',
  },
  {
    id: 'maruni-takedabishi',
    name: '丸に武田菱',
    category: '図形紋',
    description: '4つの菱形を並べた武田信玄で名高い幾何学家紋。',
    svgPath: 'M12 2A10 10 0 1 0 22 12 A10 10 0 0 0 12 2 Z M12 6 L15 9 L12 12 L9 9 Z M12 12 L15 15 L12 18 L9 15 Z M6 9 L9 12 L6 15 L3 12 Z M18 9 L21 12 L18 15 L15 12 Z',
  }
];

export const getKamonByName = (name: string): KamonItem => {
  return KAMON_LIST.find(k => k.name === name) || KAMON_LIST[0];
};
