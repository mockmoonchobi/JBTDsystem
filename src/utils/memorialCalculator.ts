import { MemorialMilestone, MemorialMilestoneType, Household, MasterOptions, PastRecord, Transaction } from '../types';
import { safeStorage, saveJsonState, loadJsonState } from './storageUtils';
import { isHouseholdAppliedForToba, isHouseholdSponsorAppliedForToba, toggleHouseholdSponsorTobaApplication, getHouseholdSponsorTobaApplication } from './tobaUtils';

export interface JapaneseEraEntry {
  name: string;
  startYear: number;
  endYear: number;
  baseYear: number;
  shortName?: string;
  latinInitial?: string;
}

/**
 * Comprehensive Japanese historical eras from Taika (645) through Reiwa.
 * Sorted chronologically descending for fast matching.
 */
export const JAPANESE_ERAS: JapaneseEraEntry[] = [
  // 近代・現代
  { name: '令和', startYear: 2019, endYear: 9999, baseYear: 2018, shortName: '令', latinInitial: 'R' },
  { name: '平成', startYear: 1989, endYear: 2019, baseYear: 1988, shortName: '平', latinInitial: 'H' },
  { name: '昭和', startYear: 1926, endYear: 1989, baseYear: 1925, shortName: '昭', latinInitial: 'S' },
  { name: '大正', startYear: 1912, endYear: 1926, baseYear: 1911, shortName: '大', latinInitial: 'T' },
  { name: '明治', startYear: 1868, endYear: 1912, baseYear: 1867, shortName: '明', latinInitial: 'M' },

  // 江戸時代 (幕末・江戸)
  { name: '慶応', startYear: 1865, endYear: 1868, baseYear: 1864 },
  { name: '元治', startYear: 1864, endYear: 1865, baseYear: 1863 },
  { name: '文久', startYear: 1861, endYear: 1864, baseYear: 1860 },
  { name: '万延', startYear: 1860, endYear: 1861, baseYear: 1859 },
  { name: '安政', startYear: 1854, endYear: 1860, baseYear: 1853 },
  { name: '嘉永', startYear: 1848, endYear: 1854, baseYear: 1847 },
  { name: '弘化', startYear: 1844, endYear: 1848, baseYear: 1843 },
  { name: '天保', startYear: 1830, endYear: 1844, baseYear: 1829 },
  { name: '文政', startYear: 1818, endYear: 1830, baseYear: 1817 },
  { name: '文化', startYear: 1804, endYear: 1818, baseYear: 1803 },
  { name: '享和', startYear: 1801, endYear: 1804, baseYear: 1800 },
  { name: '寛政', startYear: 1789, endYear: 1801, baseYear: 1788 },
  { name: '天明', startYear: 1781, endYear: 1789, baseYear: 1780 },
  { name: '安永', startYear: 1772, endYear: 1781, baseYear: 1771 },
  { name: '明和', startYear: 1764, endYear: 1772, baseYear: 1763 },
  { name: '宝暦', startYear: 1751, endYear: 1764, baseYear: 1750 },
  { name: '寛延', startYear: 1748, endYear: 1751, baseYear: 1747 },
  { name: '延享', startYear: 1744, endYear: 1748, baseYear: 1743 },
  { name: '寛保', startYear: 1741, endYear: 1744, baseYear: 1740 },
  { name: '元文', startYear: 1736, endYear: 1741, baseYear: 1735 },
  { name: '享保', startYear: 1716, endYear: 1736, baseYear: 1715 },
  { name: '正徳', startYear: 1711, endYear: 1716, baseYear: 1710 },
  { name: '宝永', startYear: 1704, endYear: 1711, baseYear: 1703 },
  { name: '元禄', startYear: 1688, endYear: 1704, baseYear: 1687 },
  { name: '貞享', startYear: 1684, endYear: 1688, baseYear: 1683 },
  { name: '天和', startYear: 1681, endYear: 1684, baseYear: 1680 },
  { name: '延宝', startYear: 1673, endYear: 1681, baseYear: 1672 },
  { name: '寛文', startYear: 1661, endYear: 1673, baseYear: 1660 },
  { name: '万治', startYear: 1658, endYear: 1661, baseYear: 1657 },
  { name: '明暦', startYear: 1655, endYear: 1658, baseYear: 1654 },
  { name: '承応', startYear: 1652, endYear: 1655, baseYear: 1651 },
  { name: '慶安', startYear: 1648, endYear: 1652, baseYear: 1647 },
  { name: '正保', startYear: 1644, endYear: 1648, baseYear: 1643 },
  { name: '寛永', startYear: 1624, endYear: 1644, baseYear: 1623 },
  { name: '元和', startYear: 1615, endYear: 1624, baseYear: 1614 },
  { name: '慶長', startYear: 1596, endYear: 1615, baseYear: 1595 },

  // 安土桃山・室町時代・戦国時代
  { name: '文禄', startYear: 1592, endYear: 1596, baseYear: 1591 },
  { name: '天正', startYear: 1573, endYear: 1592, baseYear: 1572 },
  { name: '元亀', startYear: 1570, endYear: 1573, baseYear: 1569 },
  { name: '永禄', startYear: 1558, endYear: 1570, baseYear: 1557 },
  { name: '弘治', startYear: 1555, endYear: 1558, baseYear: 1554 },
  { name: '天文', startYear: 1532, endYear: 1555, baseYear: 1531 },
  { name: '享禄', startYear: 1528, endYear: 1532, baseYear: 1527 },
  { name: '大永', startYear: 1521, endYear: 1528, baseYear: 1520 },
  { name: '永正', startYear: 1504, endYear: 1521, baseYear: 1503 },
  { name: '文亀', startYear: 1501, endYear: 1504, baseYear: 1500 },
  { name: '明応', startYear: 1492, endYear: 1501, baseYear: 1491 },
  { name: '延徳', startYear: 1489, endYear: 1492, baseYear: 1488 },
  { name: '長享', startYear: 1487, endYear: 1489, baseYear: 1486 },
  { name: '文明', startYear: 1469, endYear: 1487, baseYear: 1468 },
  { name: '応仁', startYear: 1467, endYear: 1469, baseYear: 1466 },
  { name: '文正', startYear: 1466, endYear: 1467, baseYear: 1465 },
  { name: '寛正', startYear: 1460, endYear: 1466, baseYear: 1459 },
  { name: '長禄', startYear: 1457, endYear: 1460, baseYear: 1456 },
  { name: '康正', startYear: 1455, endYear: 1457, baseYear: 1454 },
  { name: '享徳', startYear: 1452, endYear: 1455, baseYear: 1451 },
  { name: '宝徳', startYear: 1449, endYear: 1452, baseYear: 1448 },
  { name: '文安', startYear: 1444, endYear: 1449, baseYear: 1443 },
  { name: '嘉吉', startYear: 1441, endYear: 1444, baseYear: 1440 },
  { name: '永享', startYear: 1429, endYear: 1441, baseYear: 1428 },
  { name: '正長', startYear: 1428, endYear: 1429, baseYear: 1427 },
  { name: '応永', startYear: 1394, endYear: 1428, baseYear: 1393 },
  { name: '明徳', startYear: 1390, endYear: 1394, baseYear: 1389 },
  { name: '康応', startYear: 1389, endYear: 1390, baseYear: 1388 },
  { name: '嘉慶', startYear: 1387, endYear: 1389, baseYear: 1386 },
  { name: '至徳', startYear: 1384, endYear: 1387, baseYear: 1383 },
  { name: '永徳', startYear: 1381, endYear: 1384, baseYear: 1380 },
  { name: '康暦', startYear: 1379, endYear: 1381, baseYear: 1378 },
  { name: '永和', startYear: 1375, endYear: 1379, baseYear: 1374 },
  { name: '応安', startYear: 1368, endYear: 1375, baseYear: 1367 },
  { name: '貞治', startYear: 1362, endYear: 1368, baseYear: 1361 },
  { name: '康安', startYear: 1361, endYear: 1362, baseYear: 1360 },
  { name: '延文', startYear: 1356, endYear: 1361, baseYear: 1355 },
  { name: '文和', startYear: 1352, endYear: 1356, baseYear: 1351 },
  { name: '観応', startYear: 1350, endYear: 1352, baseYear: 1349 },
  { name: '貞和', startYear: 1345, endYear: 1350, baseYear: 1344 },
  { name: '康永', startYear: 1342, endYear: 1345, baseYear: 1341 },
  { name: '暦応', startYear: 1338, endYear: 1342, baseYear: 1337 },
  { name: '建武', startYear: 1334, endYear: 1338, baseYear: 1333 },

  // 南朝 (南北朝時代)
  { name: '元中', startYear: 1384, endYear: 1392, baseYear: 1383 },
  { name: '弘和', startYear: 1381, endYear: 1384, baseYear: 1380 },
  { name: '天授', startYear: 1375, endYear: 1381, baseYear: 1374 },
  { name: '文中', startYear: 1372, endYear: 1375, baseYear: 1371 },
  { name: '建徳', startYear: 1370, endYear: 1372, baseYear: 1369 },
  { name: '正平', startYear: 1346, endYear: 1370, baseYear: 1345 },
  { name: '興国', startYear: 1340, endYear: 1346, baseYear: 1339 },
  { name: '延元', startYear: 1336, endYear: 1340, baseYear: 1335 },

  // 鎌倉時代
  { name: '正慶', startYear: 1332, endYear: 1333, baseYear: 1331 },
  { name: '元弘', startYear: 1331, endYear: 1334, baseYear: 1330 },
  { name: '元徳', startYear: 1329, endYear: 1331, baseYear: 1328 },
  { name: '嘉暦', startYear: 1326, endYear: 1329, baseYear: 1325 },
  { name: '正中', startYear: 1324, endYear: 1326, baseYear: 1323 },
  { name: '元亨', startYear: 1321, endYear: 1324, baseYear: 1320 },
  { name: '元応', startYear: 1319, endYear: 1321, baseYear: 1318 },
  { name: '文保', startYear: 1317, endYear: 1319, baseYear: 1316 },
  { name: '正和', startYear: 1312, endYear: 1317, baseYear: 1311 },
  { name: '応長', startYear: 1311, endYear: 1312, baseYear: 1310 },
  { name: '延慶', startYear: 1308, endYear: 1311, baseYear: 1307 },
  { name: '徳治', startYear: 1306, endYear: 1308, baseYear: 1305 },
  { name: '嘉元', startYear: 1303, endYear: 1306, baseYear: 1302 },
  { name: '乾元', startYear: 1302, endYear: 1303, baseYear: 1301 },
  { name: '正安', startYear: 1299, endYear: 1302, baseYear: 1298 },
  { name: '永仁', startYear: 1293, endYear: 1299, baseYear: 1292 },
  { name: '正応', startYear: 1288, endYear: 1293, baseYear: 1287 },
  { name: '弘安', startYear: 1278, endYear: 1288, baseYear: 1277 },
  { name: '建治', startYear: 1275, endYear: 1278, baseYear: 1274 },
  { name: '文永', startYear: 1264, endYear: 1275, baseYear: 1263 },
  { name: '弘長', startYear: 1261, endYear: 1264, baseYear: 1260 },
  { name: '文応', startYear: 1260, endYear: 1261, baseYear: 1259 },
  { name: '正元', startYear: 1259, endYear: 1260, baseYear: 1258 },
  { name: '正嘉', startYear: 1257, endYear: 1259, baseYear: 1256 },
  { name: '康元', startYear: 1256, endYear: 1257, baseYear: 1255 },
  { name: '建長', startYear: 1249, endYear: 1256, baseYear: 1248 },
  { name: '宝治', startYear: 1247, endYear: 1249, baseYear: 1246 },
  { name: '寛元', startYear: 1243, endYear: 1247, baseYear: 1242 },
  { name: '仁治', startYear: 1240, endYear: 1243, baseYear: 1239 },
  { name: '延応', startYear: 1239, endYear: 1240, baseYear: 1238 },
  { name: '暦仁', startYear: 1238, endYear: 1239, baseYear: 1237 },
  { name: '嘉禎', startYear: 1235, endYear: 1238, baseYear: 1234 },
  { name: '文暦', startYear: 1234, endYear: 1235, baseYear: 1233 },
  { name: '天福', startYear: 1233, endYear: 1234, baseYear: 1232 },
  { name: '貞永', startYear: 1232, endYear: 1233, baseYear: 1231 },
  { name: '寛喜', startYear: 1229, endYear: 1232, baseYear: 1228 },
  { name: '安貞', startYear: 1227, endYear: 1229, baseYear: 1226 },
  { name: '嘉禄', startYear: 1225, endYear: 1227, baseYear: 1224 },
  { name: '元仁', startYear: 1224, endYear: 1225, baseYear: 1223 },
  { name: '貞応', startYear: 1222, endYear: 1224, baseYear: 1221 },
  { name: '承久', startYear: 1219, endYear: 1222, baseYear: 1218 },
  { name: '建保', startYear: 1213, endYear: 1219, baseYear: 1212 },
  { name: '建暦', startYear: 1211, endYear: 1213, baseYear: 1210 },
  { name: '承元', startYear: 1207, endYear: 1211, baseYear: 1206 },
  { name: '建永', startYear: 1206, endYear: 1207, baseYear: 1205 },
  { name: '元久', startYear: 1204, endYear: 1206, baseYear: 1203 },
  { name: '建仁', startYear: 1201, endYear: 1204, baseYear: 1200 },
  { name: '正治', startYear: 1199, endYear: 1201, baseYear: 1198 },
  { name: '建久', startYear: 1190, endYear: 1199, baseYear: 1189 },
  { name: '文治', startYear: 1185, endYear: 1190, baseYear: 1184 },

  // 平安時代
  { name: '元暦', startYear: 1184, endYear: 1185, baseYear: 1183 },
  { name: '寿永', startYear: 1182, endYear: 1184, baseYear: 1181 },
  { name: '養和', startYear: 1181, endYear: 1182, baseYear: 1180 },
  { name: '治承', startYear: 1177, endYear: 1181, baseYear: 1176 },
  { name: '安元', startYear: 1175, endYear: 1177, baseYear: 1174 },
  { name: '承安', startYear: 1171, endYear: 1175, baseYear: 1170 },
  { name: '嘉応', startYear: 1169, endYear: 1171, baseYear: 1168 },
  { name: '仁安', startYear: 1166, endYear: 1169, baseYear: 1165 },
  { name: '永万', startYear: 1165, endYear: 1166, baseYear: 1164 },
  { name: '長寛', startYear: 1163, endYear: 1165, baseYear: 1162 },
  { name: '応保', startYear: 1161, endYear: 1163, baseYear: 1160 },
  { name: '永暦', startYear: 1160, endYear: 1161, baseYear: 1159 },
  { name: '平治', startYear: 1159, endYear: 1160, baseYear: 1158 },
  { name: '保元', startYear: 1156, endYear: 1159, baseYear: 1155 },
  { name: '久寿', startYear: 1154, endYear: 1156, baseYear: 1153 },
  { name: '仁平', startYear: 1151, endYear: 1154, baseYear: 1150 },
  { name: '久安', startYear: 1145, endYear: 1151, baseYear: 1144 },
  { name: '天養', startYear: 1144, endYear: 1145, baseYear: 1143 },
  { name: '康治', startYear: 1142, endYear: 1144, baseYear: 1141 },
  { name: '永治', startYear: 1141, endYear: 1142, baseYear: 1140 },
  { name: '保延', startYear: 1135, endYear: 1141, baseYear: 1134 },
  { name: '長承', startYear: 1132, endYear: 1135, baseYear: 1131 },
  { name: '天承', startYear: 1131, endYear: 1132, baseYear: 1130 },
  { name: '大治', startYear: 1126, endYear: 1131, baseYear: 1125 },
  { name: '天治', startYear: 1124, endYear: 1126, baseYear: 1123 },
  { name: '保安', startYear: 1120, endYear: 1124, baseYear: 1119 },
  { name: '元永', startYear: 1118, endYear: 1120, baseYear: 1117 },
  { name: '永久', startYear: 1113, endYear: 1118, baseYear: 1112 },
  { name: '天永', startYear: 1110, endYear: 1113, baseYear: 1109 },
  { name: '嘉承', startYear: 1106, endYear: 1110, baseYear: 1105 },
  { name: '長治', startYear: 1104, endYear: 1106, baseYear: 1103 },
  { name: '康和', startYear: 1099, endYear: 1104, baseYear: 1098 },
  { name: '承徳', startYear: 1097, endYear: 1099, baseYear: 1096 },
  { name: '永長', startYear: 1096, endYear: 1097, baseYear: 1095 },
  { name: '嘉保', startYear: 1094, endYear: 1096, baseYear: 1093 },
  { name: '寛治', startYear: 1087, endYear: 1094, baseYear: 1086 },
  { name: '応徳', startYear: 1084, endYear: 1087, baseYear: 1083 },
  { name: '永保', startYear: 1081, endYear: 1084, baseYear: 1080 },
  { name: '承暦', startYear: 1077, endYear: 1081, baseYear: 1076 },
  { name: '承保', startYear: 1074, endYear: 1077, baseYear: 1073 },
  { name: '延久', startYear: 1069, endYear: 1074, baseYear: 1068 },
  { name: '治暦', startYear: 1065, endYear: 1069, baseYear: 1064 },
  { name: '康平', startYear: 1058, endYear: 1065, baseYear: 1057 },
  { name: '天喜', startYear: 1053, endYear: 1058, baseYear: 1052 },
  { name: '永承', startYear: 1046, endYear: 1053, baseYear: 1045 },
  { name: '寛徳', startYear: 1044, endYear: 1046, baseYear: 1043 },
  { name: '長久', startYear: 1040, endYear: 1044, baseYear: 1039 },
  { name: '長暦', startYear: 1037, endYear: 1040, baseYear: 1036 },
  { name: '長元', startYear: 1028, endYear: 1037, baseYear: 1027 },
  { name: '万寿', startYear: 1024, endYear: 1028, baseYear: 1023 },
  { name: '治安', startYear: 1021, endYear: 1024, baseYear: 1020 },
  { name: '寛仁', startYear: 1017, endYear: 1021, baseYear: 1016 },
  { name: '長和', startYear: 1012, endYear: 1017, baseYear: 1011 },
  { name: '寛弘', startYear: 1004, endYear: 1012, baseYear: 1003 },
  { name: '長保', startYear: 999, endYear: 1004, baseYear: 998 },
  { name: '長徳', startYear: 995, endYear: 999, baseYear: 994 },
  { name: '正暦', startYear: 990, endYear: 995, baseYear: 989 },
  { name: '永祚', startYear: 989, endYear: 990, baseYear: 988 },
  { name: '永延', startYear: 987, endYear: 989, baseYear: 986 },
  { name: '寛和', startYear: 985, endYear: 987, baseYear: 984 },
  { name: '永観', startYear: 983, endYear: 985, baseYear: 982 },
  { name: '天元', startYear: 978, endYear: 983, baseYear: 977 },
  { name: '貞元', startYear: 976, endYear: 978, baseYear: 975 },
  { name: '天延', startYear: 973, endYear: 976, baseYear: 972 },
  { name: '天禄', startYear: 970, endYear: 973, baseYear: 969 },
  { name: '安和', startYear: 968, endYear: 970, baseYear: 967 },
  { name: '康保', startYear: 964, endYear: 968, baseYear: 963 },
  { name: '応和', startYear: 961, endYear: 964, baseYear: 960 },
  { name: '天徳', startYear: 957, endYear: 961, baseYear: 956 },
  { name: '天暦', startYear: 947, endYear: 957, baseYear: 946 },
  { name: '天慶', startYear: 938, endYear: 947, baseYear: 937 },
  { name: '承平', startYear: 931, endYear: 938, baseYear: 930 },
  { name: '延長', startYear: 923, endYear: 931, baseYear: 922 },
  { name: '延喜', startYear: 901, endYear: 923, baseYear: 900 },
  { name: '昌泰', startYear: 898, endYear: 901, baseYear: 897 },
  { name: '寛平', startYear: 889, endYear: 898, baseYear: 888 },
  { name: '仁和', startYear: 885, endYear: 889, baseYear: 884 },
  { name: '元慶', startYear: 877, endYear: 885, baseYear: 876 },
  { name: '貞観', startYear: 859, endYear: 877, baseYear: 858 },
  { name: '天安', startYear: 857, endYear: 859, baseYear: 856 },
  { name: '斉衡', startYear: 854, endYear: 857, baseYear: 853 },
  { name: '仁寿', startYear: 851, endYear: 854, baseYear: 850 },
  { name: '嘉祥', startYear: 848, endYear: 851, baseYear: 847 },
  { name: '承和', startYear: 834, endYear: 848, baseYear: 833 },
  { name: '天長', startYear: 824, endYear: 834, baseYear: 823 },
  { name: '弘仁', startYear: 810, endYear: 824, baseYear: 809 },
  { name: '大同', startYear: 806, endYear: 810, baseYear: 805 },
  { name: '延暦', startYear: 782, endYear: 806, baseYear: 781 },

  // 奈良・飛鳥時代
  { name: '天応', startYear: 781, endYear: 782, baseYear: 780 },
  { name: '宝亀', startYear: 770, endYear: 781, baseYear: 769 },
  { name: '神護景雲', startYear: 767, endYear: 770, baseYear: 766 },
  { name: '天平神護', startYear: 765, endYear: 767, baseYear: 764 },
  { name: '天平宝字', startYear: 757, endYear: 765, baseYear: 756 },
  { name: '天平勝宝', startYear: 749, endYear: 757, baseYear: 748 },
  { name: '天平感宝', startYear: 749, endYear: 749, baseYear: 748 },
  { name: '天平', startYear: 729, endYear: 749, baseYear: 728 },
  { name: '神亀', startYear: 724, endYear: 729, baseYear: 723 },
  { name: '養老', startYear: 717, endYear: 724, baseYear: 716 },
  { name: '霊亀', startYear: 715, endYear: 717, baseYear: 714 },
  { name: '和銅', startYear: 708, endYear: 715, baseYear: 707 },
  { name: '慶雲', startYear: 704, endYear: 708, baseYear: 703 },
  { name: '大宝', startYear: 701, endYear: 704, baseYear: 700 },
  { name: '朱鳥', startYear: 686, endYear: 686, baseYear: 685 },
  { name: '白雉', startYear: 650, endYear: 654, baseYear: 649 },
  { name: '大化', startYear: 645, endYear: 650, baseYear: 644 },
];

/**
 * Creates a map and regex pattern for looking up eras by name or abbreviation.
 */
const ERA_LOOKUP_MAP: Record<string, JapaneseEraEntry> = (() => {
  const map: Record<string, JapaneseEraEntry> = {};
  for (const era of JAPANESE_ERAS) {
    map[era.name] = era;
    if (era.shortName) map[era.shortName] = era;
    if (era.latinInitial) {
      map[era.latinInitial.toUpperCase()] = era;
      map[era.latinInitial.toLowerCase()] = era;
    }
  }
  return map;
})();

// Build regex list sorted by length descending so longer era names like "神護景雲" or "天平宝字" match before "天平"
const ERA_NAMES_SORTED = Array.from(new Set(Object.keys(ERA_LOOKUP_MAP))).sort((a, b) => b.length - a.length);
const ERA_PATTERN_STRING = ERA_NAMES_SORTED.map((s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
const ERA_FULL_REGEX = new RegExp(`^(${ERA_PATTERN_STRING})\\s*([0-9元]+)[年.\\/-]?\\s*(?:([0-9]+)[月.\\/-]?)?\\s*(?:([0-9]+)日?)?$`);

/**
 * Converts an Excel serial date number (e.g. 44050 for 2020/08/07) to standard YYYY/MM/DD format.
 */
export function excelSerialToDate(serial: number): string | null {
  if (isNaN(serial) || serial <= 0 || serial > 2958465) return null;

  // Excel 1900 date system has a leap year bug where day 60 is Feb 29, 1900
  // 25569 is 1970-01-01
  let wholeDays = Math.floor(serial);
  if (wholeDays < 60) {
    wholeDays += 1;
  }
  const utcDays = wholeDays - 25569;
  const utcValue = utcDays * 86400 * 1000;
  const dateObj = new Date(utcValue);

  if (isNaN(dateObj.getTime())) return null;

  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getUTCDate()).padStart(2, '0');

  if (y < 600 || y > 2200) return null;
  return `${y}/${m}/${d}`;
}

export interface NormalizeDateOptions {
  mode?: 'calendar' | 'accounting' | 'pastRecord' | 'general';
  fiscalStartMonth?: number; // 1-12 (default 4)
  fiscalYear?: number;       // default current calculated fiscal year
  currentYear?: number;      // default: new Date().getFullYear()
  currentMonth?: number;     // 1-12, default: new Date().getMonth() + 1
}

/**
 * Normalizes user date input into standard YYYY/MM/DD (8-digit padded) format.
 * Accurately accepts inputs like:
 * - Pre-Meiji & Modern Japanese Eras: 仁寿2年11月1日, 慶応3年5月1日, 天保12年3月4日, 嘉永3年, 寛政10年10月10日, 元禄15年12月14日, 令和2年8月7日, （平成26年4月4日）, R2.8.7, R020807, H26.4.4, S50.1.1 -> standard YYYY/MM/DD (e.g. 0852/11/01)
 * - 4-digit compact MMDD (e.g. 0201 -> 2026/02/01, 12月カレンダーでの0108 -> 2027/01/08, 会計年度準拠での1208 / 0224) (pastRecord除く)
 * - 8-digit compact: 08521101 -> 0852/11/01, 20260817 -> 2026/08/17
 * - Delimited: 852/11/1, 2020/8/7, 2020-08-07, 2020.8.7 -> 0852/11/01, 2020/08/07
 * - Excel serial numbers: 44050 -> 2020/08/07
 * - 6-digit compact: 200807 -> 2020/08/07, 950401 -> 1995/04/01
 * - JS Date objects / ISO timestamp strings
 */
export function normalizeDateInput(input: any, options?: NormalizeDateOptions): string {
  if (input === null || input === undefined) return '';

  // 1. If input is already a Date object
  if (input instanceof Date && !isNaN(input.getTime())) {
    const y = String(input.getFullYear()).padStart(4, '0');
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const d = String(input.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }

  // 2. If input is a number (e.g. 44050)
  if (typeof input === 'number') {
    const dateFromSerial = excelSerialToDate(input);
    if (dateFromSerial) return dateFromSerial;
  }

  let str = String(input).trim();
  if (!str) return '';

  // Strip outer Japanese or ASCII parentheses if present e.g. （慶応3年5月1日）
  str = str.replace(/^[（(]/, '').replace(/[）)]$/, '').trim();

  // Convert full-width digits and symbols to half-width
  str = str.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
  str = str.replace(/[\uFF0F]/g, '/').replace(/[\uFF0D\u2014\u2015\u2212\u30FC]/g, '-').replace(/[\uFF0E]/g, '.');

  // 3. Check ISO timestamp string e.g. 2020-08-07T00:00:00.000Z or 2020-08-07 10:30:00
  const isoMatch = str.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,2})(?:T|\s).*$/);
  if (isoMatch) {
    const y = String(parseInt(isoMatch[1], 10)).padStart(4, '0');
    const m = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
    const d = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }

  // 4. Japanese Era matching for ALL historical eras (from Taika 645 to Reiwa, e.g. 仁寿2年11月1日, 慶応3年5月1日, 天保12年, 元禄15年12月14日, 令和2年8月7日, R2.8.7)
  const eraMatch = str.match(ERA_FULL_REGEX);
  if (eraMatch) {
    const rawEraName = eraMatch[1];
    const eraEntry = ERA_LOOKUP_MAP[rawEraName] || ERA_LOOKUP_MAP[rawEraName.toUpperCase()];
    if (eraEntry) {
      const eraYearStr = eraMatch[2];
      const eraYear = eraYearStr === '元' ? 1 : parseInt(eraYearStr, 10);
      const m = eraMatch[3] ? parseInt(eraMatch[3], 10) : 1;
      const d = eraMatch[4] ? parseInt(eraMatch[4], 10) : 1;

      if (!isNaN(eraYear) && !isNaN(m) && !isNaN(d)) {
        const fullYear = eraEntry.baseYear + eraYear;
        const validMonth = Math.min(Math.max(m, 1), 12);
        const validDay = Math.min(Math.max(d, 1), 31);
        return `${String(fullYear).padStart(4, '0')}/${String(validMonth).padStart(2, '0')}/${String(validDay).padStart(2, '0')}`;
      }
    }
  }

  // 5. Japanese Era compact format: e.g. R020807, H260404, S500101, M450701
  const eraCompactMatch = str.match(/^(令和|平成|昭和|大正|明治|令|平|昭|大|明|R|r|H|h|S|s|T|t|M|m)\s*([0-9]{1,2})([0-9]{2})([0-9]{2})$/);
  if (eraCompactMatch) {
    const rawEraName = eraCompactMatch[1];
    const eraEntry = ERA_LOOKUP_MAP[rawEraName] || ERA_LOOKUP_MAP[rawEraName.toUpperCase()];
    if (eraEntry) {
      const eraYear = parseInt(eraCompactMatch[2], 10);
      const m = parseInt(eraCompactMatch[3], 10);
      const d = parseInt(eraCompactMatch[4], 10);

      const fullYear = eraEntry.baseYear + eraYear;
      return `${String(fullYear).padStart(4, '0')}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
    }
  }

  // 6. 8 digits compact format e.g. 20200807 or 08521101 (Heian/Edo/Modern dates)
  if (/^\d{8}$/.test(str)) {
    const y = parseInt(str.slice(0, 4), 10);
    const m = parseInt(str.slice(4, 6), 10);
    const d = parseInt(str.slice(6, 8), 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
    }
  }

  // 7. Delimited format e.g. 2020/8/7, 852/11/1, 1865-5-1, 1702.12.14, 2020年8月7日, 852年11月1日
  const partsMatch = str.match(/^(\d{1,4})[年\/\.\-]\s*(\d{1,2})[月\/\.\-]?\s*(\d{1,2})?日?$/);
  if (partsMatch) {
    const y = parseInt(partsMatch[1], 10);
    const m = partsMatch[2] ? parseInt(partsMatch[2], 10) : 1;
    const d = partsMatch[3] ? parseInt(partsMatch[3], 10) : 1;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
    }
  }

  // 8. 4 digits compact format (MMDD e.g. "0201", "1208", "0224") - NOT for pastRecord (requires full date with year/era)
  if (/^\d{4}$/.test(str) && options?.mode !== 'pastRecord') {
    const mm = parseInt(str.slice(0, 2), 10);
    const dd = parseInt(str.slice(2, 4), 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const mode = options?.mode || 'calendar';
      if (mode === 'accounting') {
        const startMonth = options?.fiscalStartMonth ?? 4;
        const now = new Date();
        const currentFiscalYear = (now.getMonth() + 1 >= startMonth) ? now.getFullYear() : now.getFullYear() - 1;
        const targetFiscalYear = options?.fiscalYear ?? currentFiscalYear;

        let targetYear: number;
        if (startMonth === 1) {
          targetYear = targetFiscalYear;
        } else {
          // 4月期首等の場合: 4〜12月は targetFiscalYear(期首年), 1〜3月は targetFiscalYear + 1(期末年)
          if (mm >= startMonth) {
            targetYear = targetFiscalYear;
          } else {
            targetYear = targetFiscalYear + 1;
          }
        }
        return `${String(targetYear).padStart(4, '0')}/${String(mm).padStart(2, '0')}/${String(dd).padStart(2, '0')}`;
      } else {
        // calendar / general
        const now = new Date();
        const currentYear = options?.currentYear ?? now.getFullYear();
        const currentMonth = options?.currentMonth ?? (now.getMonth() + 1);

        let targetYear = currentYear;
        // 12月限りの特則: 12月に0108や0215など12月未満(1〜11月)が入力された場合は翌年
        if (currentMonth === 12 && mm < 12) {
          targetYear = currentYear + 1;
        }
        return `${String(targetYear).padStart(4, '0')}/${String(mm).padStart(2, '0')}/${String(dd).padStart(2, '0')}`;
      }
    }
  }

  // 9. Pure number or decimal that could be an Excel Serial Date (e.g. "44050", "44050.0")
  if (/^\d{5,6}(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    if (num >= 1000 && num <= 100000) {
      const fromSerial = excelSerialToDate(num);
      if (fromSerial) return fromSerial;
    }
  }

  // 10. 6 digits compact format (YYMMDD e.g. "200807" -> 2020/08/07 or "950401" -> 1995/04/01)
  if (/^\d{6}$/.test(str)) {
    const yy = parseInt(str.slice(0, 2), 10);
    const mm = parseInt(str.slice(2, 4), 10);
    const dd = parseInt(str.slice(4, 6), 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const fullYear = yy >= 40 ? 1900 + yy : 2000 + yy;
      return `${String(fullYear).padStart(4, '0')}/${String(mm).padStart(2, '0')}/${String(dd).padStart(2, '0')}`;
    }
  }

  // 11. Cleaned ISO format e.g. 2020-08-07 -> 2020/08/07 or 0852/11/01
  const cleanedISO = str.replace(/-/g, '/');
  const isoParts = cleanedISO.match(/^(\d{1,4})\/(\d{1,2})\/(\d{1,2})$/);
  if (isoParts) {
    const y = parseInt(isoParts[1], 10);
    const m = parseInt(isoParts[2], 10);
    const d = parseInt(isoParts[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
    }
  }

  // 12. Date parsing fallback
  const dateObj = new Date(str.replace(/\//g, '-'));
  if (!isNaN(dateObj.getTime()) && dateObj.getFullYear() >= 600 && dateObj.getFullYear() < 2200) {
    const y = String(dateObj.getFullYear()).padStart(4, '0');
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }

  return str;
}

/**
 * Normalizes furigana input:
 * - Converts half-width katakana (including voiced/semi-voiced combinations) to full-width.
 * - Converts all katakana characters to hiragana.
 * - Trims whitespace and normalizes text safely.
 */
export function normalizeFurigana(input: any): string {
  if (input === null || input === undefined) return '';
  let str = String(input).trim();
  if (!str) return '';

  // 1. Convert half-width voiced/semi-voiced combinations first
  const halfVoicedPairs: [string, string][] = [
    ['ｶﾞ', 'が'], ['ｷﾞ', 'ぎ'], ['ｸﾞ', 'ぐ'], ['ｹﾞ', 'げ'], ['ｺﾞ', 'ご'],
    ['ｻﾞ', 'ざ'], ['ｼﾞ', 'じ'], ['ｽﾞ', 'ず'], ['ｾﾞ', 'ぜ'], ['ｿﾞ', 'ぞ'],
    ['ﾀﾞ', 'だ'], ['ﾁﾞ', 'ぢ'], ['ﾂﾞ', 'づ'], ['ﾃﾞ', 'で'], ['ﾄﾞ', 'ど'],
    ['ﾊﾞ', 'ば'], ['ﾋﾞ', 'び'], ['ﾌﾞ', 'ぶ'], ['ﾍﾞ', 'べ'], ['ﾎﾞ', 'ぼ'],
    ['ﾊﾟ', 'ぱ'], ['ﾋﾟ', 'ぴ'], ['ﾌﾟ', 'ぷ'], ['ﾍﾟ', 'ぺ'], ['ﾎﾟ', 'ぽ'],
    ['ｳﾞ', 'ゔ'], ['ﾜﾞ', 'わ゛'], ['ｦﾞ', 'を゛'],
  ];

  for (const [half, fullHira] of halfVoicedPairs) {
    str = str.split(half).join(fullHira);
  }

  // 2. Convert remaining single half-width katakana to hiragana
  const singleHalfKana: Record<string, string> = {
    'ｱ': 'あ', 'ｲ': 'い', 'ｳ': 'う', 'ｴ': 'え', 'ｵ': 'お',
    'ｶ': 'か', 'ｷ': 'き', 'ｸ': 'く', 'ｹ': 'け', 'ｺ': 'こ',
    'ｻ': 'さ', 'ｼ': 'し', 'ｽ': 'す', 'ｾ': 'せ', 'ｿ': 'そ',
    'ﾀ': 'た', 'ﾁ': 'ち', 'ﾂ': 'つ', 'ﾃ': 'て', 'ﾄ': 'と',
    'ﾅ': 'な', 'ﾆ': 'に', 'ﾇ': 'ぬ', 'ﾈ': 'ね', 'ﾉ': 'の',
    'ﾊ': 'は', 'ﾋ': 'ひ', 'ﾌ': 'ふ', 'ﾍ': 'へ', 'ﾎ': 'ほ',
    'ﾏ': 'ま', 'ﾐ': 'み', 'ﾑ': 'む', 'ﾒ': 'め', 'ﾓ': 'も',
    'ﾔ': 'や', 'ﾕ': 'ゆ', 'ﾖ': 'よ',
    'ﾗ': 'ら', 'ﾘ': 'り', 'ﾙ': 'る', 'ﾚ': 'れ', 'ﾛ': 'ろ',
    'ﾜ': 'わ', 'ｦ': 'を', 'ﾝ': 'ん',
    'ｧ': 'ぁ', 'ｨ': 'ぃ', 'ｩ': 'ぅ', 'ｪ': 'ぇ', 'ｫ': 'ぉ',
    'ｯ': 'っ', 'ｬ': 'ゃ', 'ｭ': 'ゅ', 'ｮ': 'ょ',
    'ｰ': 'ー', '･': '・', '｡': '。', '｢': '「', '｣': '」', '､': '、',
    'ﾞ': '゛', 'ﾟ': '゜'
  };

  str = str.replace(/[ｱ-ﾝｧ-ｮｰ･｡｢｣､ﾞﾟ]/g, (ch) => singleHalfKana[ch] || ch);

  // 3. Convert full-width Katakana (U+30A1..U+30F6) to Hiragana (U+3041..U+3096)
  str = str.replace(/[\u30A1-\u30F6]/g, (match) => {
    const code = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(code);
  });

  // 4. Special katakana characters
  str = str.replace(/\u30F7/g, 'わ゛').replace(/\u30F8/g, 'ゐ゛').replace(/\u30F9/g, 'ゑ゛').replace(/\u30FA/g, 'を゛');

  // 5. Normalize combining unicode characters
  str = str.normalize('NFC');

  return str;
}

/**
 * Converts a Gregorian year (and optional month and day) to Japanese Era String
 * (e.g., 2019/04/30 -> 平成31年, 2019/05/01 -> 令和元年, 1989/01/07 -> 昭和64年, 1989/01/08 -> 平成元年, 1865 -> 慶応元年, 1702 -> 元禄15年)
 */
export function getJapaneseEra(year: number, month?: number, day?: number): string {
  if (isNaN(year)) return '';

  // If month is provided, perform accurate date-level era boundary matching
  if (month !== undefined && !isNaN(month)) {
    const m = Math.min(Math.max(month, 1), 12);
    const d = day !== undefined && !isNaN(day) ? Math.min(Math.max(day, 1), 31) : 1;
    const dateNum = year * 10000 + m * 100 + d;

    // 1. 令和: 2019年5月1日以降 (2019/05/01〜)
    if (dateNum >= 20190501) {
      const rYear = year - 2018;
      return `令和${rYear === 1 ? '元' : rYear}年`;
    }

    // 2. 平成: 1989年1月8日 〜 2019年4月30日 (1989/01/08〜2019/04/30)
    if (dateNum >= 19890108) {
      const hYear = year - 1988;
      return `平成${hYear === 1 ? '元' : hYear}年`;
    }

    // 3. 昭和: 1926年12月25日 〜 1989年1月7日 (1926/12/25〜1989/01/07)
    if (dateNum >= 19261225) {
      const sYear = year - 1925;
      return `昭和${sYear === 1 ? '元' : sYear}年`;
    }

    // 4. 大正: 1912年7月30日 〜 1926年12月24日 (1912/07/30〜1926/12/24)
    if (dateNum >= 19120730) {
      const tYear = year - 1911;
      return `大正${tYear === 1 ? '元' : tYear}年`;
    }

    // 5. 明治: 1868年1月1日 (明治元年) 〜 1912年7月29日 (1868/01/01〜1912/07/29)
    if (dateNum >= 18680101) {
      const mYear = year - 1867;
      return `明治${mYear === 1 ? '元' : mYear}年`;
    }
  }

  // Fallback to year-based matching (or for pre-Meiji historical eras)
  for (const era of JAPANESE_ERAS) {
    if (year >= era.startYear) {
      const eraYear = year - era.baseYear;
      return `${era.name}${eraYear === 1 ? '元' : eraYear}年`;
    }
  }

  return `${year}年`;
}

/**
 * Formats a date string (2014/04/04, 2014-04-04, 20140404) into Japanese Era format without leading zeros.
 * Example: '2019/04/15' -> '（平成31年4月15日）'
 *          '2019/05/01' -> '（令和元年5月1日）'
 */
export function formatJapaneseEraDate(dateStr: string, withParentheses = true): string {
  if (!dateStr) return '';
  const normalized = normalizeDateInput(dateStr);
  const parts = normalized.split('/');
  if (parts.length !== 3) return dateStr;

  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);

  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;

  const era = getJapaneseEra(y, m, d);
  const formatted = `${era}${m}月${d}日`;
  return withParentheses ? `（${formatted}）` : formatted;
}

/**
 * Formats a date string into Month/Day only (e.g. '2026/08/15' -> '8月15日')
 */
export function formatMonthDayOnly(dateStr: string): string {
  if (!dateStr) return '';
  const normalized = normalizeDateInput(dateStr);
  const parts = normalized.split('/');
  if (parts.length !== 3) return dateStr;

  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(m) || isNaN(d)) return dateStr;

  return `${m}月${d}日`;
}

export interface HiganPeriodOption {
  id: string;
  label: string; // e.g. '令和8年 春彼岸', '令和8年 新盆', '令和8年 秋彼岸'
  periodText: string; // e.g. '9月〜翌3月', '前年〜本年7・8月'
  type: 'spring' | 'bon' | 'autumn';
  year: number;
  startDate: string;
  endDate: string;
}

/**
 * Generates mailing period options in exact chronological order:
 * 1. Current Year Niibon (e.g. 令和8年 新盆)
 * 2. Current Year Autumn Higan (e.g. 令和8年 秋彼岸)
 * 3. Next Year Spring Higan (e.g. 令和9年 春彼岸)
 * 4. Next Year Niibon (e.g. 令和9年 新盆)
 * 5. Next Year Autumn Higan (e.g. 令和9年 秋彼岸)
 */
/**
 * Generates options for Higan / Niibon mailing periods:
 * 1. Current Year Niibon (Kept during August so temple can check Niibon spirits)
 * 2. Current Year Autumn Higan
 * 3. Next Year Spring Higan
 * 4. Next Year Niibon
 * 5. Next Year Autumn Higan
 */
export function generateHiganPeriods(currentYear: number, bonSeason: string = '8月盆'): HiganPeriodOption[] {
  const isJulyBon = bonSeason === '7月盆';
  const bonLabelSuffix = isJulyBon ? '7月盆' : '8月盆';

  const eraCurrent = getJapaneseEra(currentYear);
  const eraNext = getJapaneseEra(currentYear + 1);

  const periods: HiganPeriodOption[] = [
    // 0. 本年 春彼岸（一つ前の彼岸: 期限は過ぎていても閲覧・確認できるように表示）
    {
      id: `${currentYear}-spring`,
      label: `${eraCurrent} 春彼岸`,
      periodText: `${eraCurrent}春分(3/21)〜${eraCurrent}秋分(9/22)の年忌`,
      type: 'spring',
      year: currentYear,
      startDate: `${currentYear}/03/21`,
      endDate: `${currentYear}/09/22`,
    },

    // 1. 本年 新盆 (8月盆: 前年6月26日〜本年6月25日没 / 7月盆: 前年5月26日〜本年5月25日没)
    // 8月中はお盆期間中の精霊確認のためタブとして保持
    {
      id: `${currentYear}-bon`,
      label: `${eraCurrent} 新盆 (${bonLabelSuffix})`,
      periodText: isJulyBon ? '前年5月26日〜本年5月25日の没者' : '前年6月26日〜本年6月25日の没者',
      type: 'bon',
      year: currentYear,
      startDate: isJulyBon ? `${currentYear - 1}/05/26` : `${currentYear - 1}/06/26`,
      endDate: isJulyBon ? `${currentYear}/05/25` : `${currentYear}/06/25`,
    },

    // 2. 本年 秋彼岸 (秋分(9/23)〜翌春分(3/21)の年忌)
    {
      id: `${currentYear}-autumn`,
      label: `${eraCurrent} 秋彼岸`,
      periodText: `${eraCurrent}秋分(9/23)〜${eraNext}春分(3/21)の年忌`,
      type: 'autumn',
      year: currentYear,
      startDate: `${currentYear}/09/23`,
      endDate: `${currentYear + 1}/03/21`,
    },

    // 3. 翌年 春彼岸 (春分(3/22)〜秋分(9/23)の年忌)
    {
      id: `${currentYear + 1}-spring`,
      label: `${eraNext} 春彼岸`,
      periodText: `${eraNext}春分(3/22)〜${eraNext}秋分(9/23)の年忌`,
      type: 'spring',
      year: currentYear + 1,
      startDate: `${currentYear + 1}/03/22`,
      endDate: `${currentYear + 1}/09/23`,
    },

    // 4. 翌年 新盆
    {
      id: `${currentYear + 1}-bon`,
      label: `${eraNext} 新盆 (${bonLabelSuffix})`,
      periodText: isJulyBon ? '本年5月26日〜翌年5月25日の没者' : '本年6月26日〜翌年6月25日の没者',
      type: 'bon',
      year: currentYear + 1,
      startDate: isJulyBon ? `${currentYear}/05/26` : `${currentYear}/06/26`,
      endDate: isJulyBon ? `${currentYear + 1}/05/25` : `${currentYear + 1}/06/25`,
    },

    // 5. 翌年 秋彼岸
    {
      id: `${currentYear + 1}-autumn`,
      label: `${eraNext} 秋彼岸`,
      periodText: `${eraNext}秋分(9/24)〜${getJapaneseEra(currentYear + 2)}春分(3/20)の年忌`,
      type: 'autumn',
      year: currentYear + 1,
      startDate: `${currentYear + 1}/09/24`,
      endDate: `${currentYear + 2}/03/20`,
    },
  ];

  return periods;
}

/**
 * 没年月日から新盆の対象年（西暦）を取得
 */
export function getNiibonTargetYear(
  deathDateStr?: string,
  bonSeason: string = '8月盆'
): number | null {
  if (!deathDateStr || !deathDateStr.trim()) return null;
  const normalized = normalizeDateInput(deathDateStr);
  const parts = normalized.split('/');
  if (parts.length !== 3) return null;

  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;

  const isJulyBon = bonSeason === '7月盆';
  if (isJulyBon) {
    return (m > 5 || (m === 5 && d >= 26)) ? y + 1 : y;
  } else {
    return (m > 6 || (m === 6 && d >= 26)) ? y + 1 : y;
  }
}

/**
 * 没年月日から新盆表記（例: 令和8年新盆）を算出
 * 基準:
 * - 8月盆: 前年6月26日〜本年6月25日の没者 → 本年新盆、6月26日以降の没者 → 翌年新盆
 * - 7月盆: 前年5月26日〜本年5月25日の没者 → 本年新盆、5月26日以降の没者 → 翌年新盆
 */
export function calculateNiibonFromDeathDate(
  deathDateStr?: string,
  bonSeason: string = '8月盆'
): string {
  const targetYear = getNiibonTargetYear(deathDateStr, bonSeason);
  if (targetYear === null) return '';
  return `${getJapaneseEra(targetYear)}新盆`;
}

/**
 * 過去帳一覧等において、新盆ラベル（黄色バッジ等）を表示すべきか判定
 * （「当該年度」および「次年度」の新盆のみ表示対象とする）
 */
export function isRelevantNiibon(
  niibonStr?: string,
  deathDateStr?: string,
  bonSeason: string = '8月盆',
  currentYear: number = new Date().getFullYear()
): boolean {
  if (!deathDateStr || !deathDateStr.trim()) return false;
  const targetYear = getNiibonTargetYear(deathDateStr, bonSeason);
  if (targetYear !== null) {
    return targetYear === currentYear || targetYear === currentYear + 1;
  }

  // もし手動入力等のniibon文字列がある場合
  if (niibonStr && niibonStr.trim()) {
    const eraCurrent = getJapaneseEra(currentYear);
    const eraNext = getJapaneseEra(currentYear + 1);
    if (niibonStr.includes(eraCurrent) || niibonStr.includes(eraNext)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculates the ID of the upcoming mailing target period (次回発送対象).
 * Rules:
 * - 8月盆の場合: 新盆の案内発送は8月12日までに完了しているべきであるため、
 *   8月12日以降は「次回発送対象」ボタンを新盆から【本年 秋彼岸】へ切り替える。
 * - 7月盆の場合: 同様に7月12日以降は秋彼岸へ切り替える。
 * - お盆期間中（8月中）は新盆の精霊確認を行えるよう、新盆タブ自体はそのまま残す。
 */
export function getUpcomingMailingPeriodId(
  currentYear: number,
  bonSeason: string = '8月盆',
  now: Date = new Date()
): string {
  const isJulyBon = bonSeason === '7月盆';
  const month = now.getMonth() + 1; // 1〜12
  const date = now.getDate();

  if (isJulyBon) {
    if (month < 7 || (month === 7 && date < 12)) {
      return `${currentYear}-bon`;
    } else if (month < 10) {
      return `${currentYear}-autumn`;
    } else {
      return `${currentYear + 1}-spring`;
    }
  } else {
    // 8月盆
    if (month < 8 || (month === 8 && date < 12)) {
      return `${currentYear}-bon`;
    } else if (month < 10 || (month === 10 && date <= 15)) {
      return `${currentYear}-autumn`;
    } else {
      return `${currentYear + 1}-spring`;
    }
  }
}

export interface HouseholdNiibonStatus {
  isCurrentYearNiibon: boolean;
  currentYearNiibonCount: number;
  currentYearLabel: string;
  currentYearRecords: { id: string; householdId: string; dharmaName?: string; secularName?: string; deathDate?: string; ageAtDeath?: number; niibon?: string }[];
  isNextYearNiibon: boolean;
  nextYearNiibonCount: number;
  nextYearLabel: string;
  nextYearRecords: { id: string; householdId: string; dharmaName?: string; secularName?: string; deathDate?: string; ageAtDeath?: number; niibon?: string }[];
  hasNiibon: boolean;
  allRelevantRecords: { id: string; householdId: string; dharmaName?: string; secularName?: string; deathDate?: string; ageAtDeath?: number; niibon?: string }[];
}

/**
 * 世帯単位で「本年度新盆」および「来年度新盆」の対象精霊情報・表記ラベルを取得
 */
export function getHouseholdNiibonStatus(
  pastRecords: { id: string; householdId: string; dharmaName?: string; secularName?: string; deathDate?: string; ageAtDeath?: number; niibon?: string }[],
  householdId: string,
  bonSeason: string = '8月盆',
  currentYear: number = new Date().getFullYear()
): HouseholdNiibonStatus {
  const eraCurrent = getJapaneseEra(currentYear);
  const eraNext = getJapaneseEra(currentYear + 1);
  const currentNiibonTag = `${eraCurrent}新盆`;
  const nextNiibonTag = `${eraNext}新盆`;

  const householdRecords = pastRecords.filter((r) => r.householdId === householdId);

  const currentYearRecords = householdRecords.filter((r) => {
    if (!r.deathDate || !r.deathDate.trim()) return false;
    const recordNiibon = r.niibon && r.niibon.trim() !== ''
      ? r.niibon.trim()
      : calculateNiibonFromDeathDate(r.deathDate, bonSeason);
    const targetYear = getNiibonTargetYear(r.deathDate, bonSeason);
    return recordNiibon === currentNiibonTag || recordNiibon.includes(currentNiibonTag) || targetYear === currentYear;
  });

  const nextYearRecords = householdRecords.filter((r) => {
    if (!r.deathDate || !r.deathDate.trim()) return false;
    const recordNiibon = r.niibon && r.niibon.trim() !== ''
      ? r.niibon.trim()
      : calculateNiibonFromDeathDate(r.deathDate, bonSeason);
    const targetYear = getNiibonTargetYear(r.deathDate, bonSeason);
    return recordNiibon === nextNiibonTag || recordNiibon.includes(nextNiibonTag) || targetYear === currentYear + 1;
  });

  const currentYearNiibonCount = currentYearRecords.length;
  const nextYearNiibonCount = nextYearRecords.length;

  return {
    isCurrentYearNiibon: currentYearNiibonCount > 0,
    currentYearNiibonCount,
    currentYearLabel: currentYearNiibonCount > 1 ? `${eraCurrent}新盆 (${currentYearNiibonCount}名)` : `${eraCurrent}新盆`,
    currentYearRecords,

    isNextYearNiibon: nextYearNiibonCount > 0,
    nextYearNiibonCount,
    nextYearLabel: nextYearNiibonCount > 1 ? `${eraNext}新盆 (${nextYearNiibonCount}名)` : `${eraNext}新盆`,
    nextYearRecords,

    hasNiibon: currentYearNiibonCount > 0 || nextYearNiibonCount > 0,
    allRelevantRecords: [...currentYearRecords, ...nextYearRecords],
  };
}

/**
 * 施餓鬼塔婆施主一覧および各帳票向け:
 * 過去帳の「新盆(niibon)」フィールドを参照し、指定世帯の新盆情報および該当年の新盆精霊までの最新戒名情報を算出
 * 
 * 基準:
 * - 対象年: 年（西暦カレンダー年）が変わったらその年の新盆が出現（当年＝targetBonYear）
 * - 新盆判定: 過去帳の「niibon」フィールド（未設定時は自動計算）が「令和〇年新盆」に一致するか
 * - 複数名該当の場合は「令和〇年新盆〇名」
 * - 最新のお戒名: 該当年の新盆精霊まで（8月盆なら当該年6月25日、7月盆なら5月25日以前の没者）の中で最新の精霊を表示
 */
export function getHouseholdNiibonAndPastInfo(
  pastRecords: { id: string; householdId: string; dharmaName?: string; secularName?: string; deathDate?: string; ageAtDeath?: number; niibon?: string }[],
  householdId: string,
  bonSeason: string = '8月盆',
  baseDate: Date = new Date()
) {
  const targetBonYear = baseDate.getFullYear();
  const eraString = getJapaneseEra(targetBonYear);
  const targetNiibonLabel = `${eraString}新盆`;

  const isJulyBon = bonSeason === '7月盆';
  // 当該年新盆精霊の没年月日上限（8月盆: 当年6月25日、7月盆: 当年5月25日）
  const niibonCutoffDate = isJulyBon ? `${targetBonYear}/05/25` : `${targetBonYear}/06/25`;

  const householdRecords = pastRecords.filter((r) => r.householdId === householdId);

  // 過去帳の「新盆」フィールド（または未入力時は自動計算）を参照して判定
  const niibonRecords = householdRecords.filter((r) => {
    if (!r.deathDate || !r.deathDate.trim()) return false;
    const recordNiibon = r.niibon && r.niibon.trim() !== '' 
      ? r.niibon.trim() 
      : calculateNiibonFromDeathDate(r.deathDate, bonSeason);
    return recordNiibon === targetNiibonLabel || recordNiibon.includes(targetNiibonLabel);
  });

  const niibonCount = niibonRecords.length;
  let niibonLabel = '';
  if (niibonCount === 1) {
    niibonLabel = `${eraString}新盆`;
  } else if (niibonCount >= 2) {
    niibonLabel = `${eraString}新盆${niibonCount}名`;
  }

  // 最新のお戒名: 該当年の新盆精霊までの精霊の中で最新の精霊を取得
  let latestRecord: (typeof pastRecords)[0] | null = null;
  if (householdRecords.length > 0) {
    // まず新盆上限日以前に亡くなられた精霊を優先
    const eligibleRecords = householdRecords.filter((r) => {
      if (!r.deathDate || !r.deathDate.trim()) return false;
      const normalized = normalizeDateInput(r.deathDate);
      return normalized <= niibonCutoffDate;
    });

    const recordsWithDate = householdRecords.filter((r) => !!r.deathDate && r.deathDate.trim() !== '');
    const recordsToSort = eligibleRecords.length > 0 ? eligibleRecords : (recordsWithDate.length > 0 ? recordsWithDate : householdRecords);
    const sorted = [...recordsToSort].sort((a, b) => {
      const dateA = normalizeDateInput(a.deathDate || '');
      const dateB = normalizeDateInput(b.deathDate || '');
      return dateB.localeCompare(dateA);
    });
    latestRecord = sorted[0];
  }

  return {
    isNiibon: niibonCount > 0,
    niibonCount,
    niibonLabel,
    niibonRecords,
    latestRecord,
    targetBonYear,
    targetNiibonLabel,
    niibonCutoffDate,
  };
}

/**
 * Typography metrics calculation for authentic Japanese vertical postcard back
 */
export function getPostcardBackTypography(message: string, offset: number = 0): { fontSize: string; lineHeight: string; letterSpacing: string } {
  if (!message) {
    const basePt = 10;
    const effectivePt = Math.max(6, Math.min(18, basePt + offset));
    return { fontSize: `${effectivePt.toFixed(1)}pt`, lineHeight: '1.6', letterSpacing: '0.04em' };
  }
  const clean = message.replace(/[\s\n]*合掌\s*$/, '').trim();
  const lines = clean.split('\n');
  const maxLineLen = Math.max(...lines.map((l) => l.length), 0);
  const lineCount = lines.length;
  const totalLength = clean.length;

  let basePt = 8.5;
  let lineHeight = '1.45';
  let letterSpacing = '0.02em';

  // 余裕がある場合（文字数200文字以下、9行以下、1行あたり32文字以内）は最大10pt
  if (totalLength <= 200 && lineCount <= 9 && maxLineLen <= 32) {
    basePt = 10;
    lineHeight = '1.6';
    letterSpacing = '0.04em';
  } else if (totalLength <= 270 && lineCount <= 11 && maxLineLen <= 35) {
    // 少し多めの場合（文字数270文字以下、11行以下、1行あたり35文字以内）は9.5pt
    basePt = 9.5;
    lineHeight = '1.55';
    letterSpacing = '0.035em';
  } else if (totalLength <= 350 && lineCount <= 13) {
    // 中程度の場合（文字数350文字以下、13行以下）は9pt
    basePt = 9;
    lineHeight = '1.5';
    letterSpacing = '0.03em';
  }

  const effectivePt = Math.max(6, Math.min(18, basePt + offset));
  return {
    fontSize: `${effectivePt.toFixed(1)}pt`,
    lineHeight,
    letterSpacing,
  };
}

/**
 * Converts integers or numbers in strings to Japanese Kanji numerals (漢数字)
 * e.g., 1 -> 一, 2 -> 二, 13 -> 十三, 33 -> 三十三, 50 -> 五十
 */
export function toKanjiNumber(n: number): string {
  if (isNaN(n) || n < 0) return '';
  if (n === 0) return '〇';

  const kanjiDigits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (n < 10) return kanjiDigits[n];

  let result = '';

  const thousand = Math.floor(n / 1000);
  let remainder = n % 1000;
  if (thousand > 0) {
    result += (thousand === 1 ? '千' : kanjiDigits[thousand] + '千');
  }

  const hundred = Math.floor(remainder / 100);
  remainder = remainder % 100;
  if (hundred > 0) {
    result += (hundred === 1 ? '百' : kanjiDigits[hundred] + '百');
  }

  const ten = Math.floor(remainder / 10);
  const unit = remainder % 10;
  if (ten > 0) {
    result += (ten === 1 ? '十' : kanjiDigits[ten] + '十');
  }

  if (unit > 0) {
    result += kanjiDigits[unit];
  }

  return result;
}

/**
 * Notice template types and default templates for Postcard & A4 notices
 */
export type NoticeTemplatePaperType = 'postcard' | 'a4';

export interface NoticeTemplateItem {
  id: string;
  name: string; // テンプレート名（例: 「秋彼岸法要のご案内」「新盆法要案内」「A4 年忌法要通知書」）
  title?: string; // 文書タイトル（例: 「年回忌法要のご案内」「年中行事のご案内」）
  type: NoticeTemplatePaperType; // 種別: 'postcard' (はがき) | 'a4' (A4)
  category?: 'higan' | 'niibon' | 'general' | 'memorial' | 'custom' | string;
  content: string; // 本文（タグ含む）
  isDefault?: boolean;
}

export const DEFAULT_HIGAN_TEMPLATE = `謹啓　時下、{施主名}におかれましては益々ご清祥のこととお慶び申し上げます。日頃より当寺の護持運営につきまして多大なるご理解とご協力を賜り厚く御礼申し上げます。
　さて、{法要期}の時期が近づいてまいりました。次の法要期までに、
{精霊文章}
　つきましては、法要のご予約・お申込みは準備の都合上、ご希望日の二ヶ月前頃までにご連絡くださいますようお願い申し上げます。なお、お塔婆のみご希望の場合は受取の一週間前までにご連絡ください。
　また、彼岸法要時の合同供養も合わせてお申込みいただけます。
　時節柄、皆様のご健勝とご多幸を心よりお祈り申し上げます。
　
合掌`;

export const DEFAULT_NIIBON_TEMPLATE = `謹啓　盛夏の候、{施主名}におかれましては益々ご清祥のこととお慶び申し上げます。日頃より当寺の護持運営につきまして多大なるご理解とご協力を賜り厚く御礼申し上げます。
　さて、夏のお盆が近づいてまいりました。本年新盆にあたり、つきましては新盆合同法要（盆法要）を開催いたします。
　本年は故 {故人名} の「新盆（初盆）」をお迎えのこととお察し申し上げます。
　つきましては、万障お繰り合わせの上、ご遺族・ご親族皆様お揃いでご参列賜りますよう謹んでご案内申し上げます。

記

一、法要名：新盆（初盆）合同供養法要
一、期日：{法要期}
一、場所：当山 本堂
一、該当精霊：
{精霊一覧}

　時節柄、皆様のご健勝とご多幸を心よりお祈り申し上げます。
　
合掌`;

export const DEFAULT_MEMORIAL_POSTCARD_TEMPLATE = `謹啓　時下、{施主名}におかれましては益々ご清祥のこととお慶び申し上げます。日頃より当寺の護持運営につきまして多大なるご理解とご協力を賜り厚く御礼申し上げます。
　さて、本年（{法要期}）は、下記精霊の年回忌法要の正当年に当たっております。
{精霊一覧}
　つきましては、ご遺族・ご親族皆様お揃いでご参列賜り、追善供養の誠を捧げられますよう謹んでご案内申し上げます。
　なお、法要日程・お塔婆供養のお申込みにつきましては、お早めに寺務所までご連絡賜りますようお願い申し上げます。
　
合掌`;

export const DEFAULT_A4_MEMORIAL_TEMPLATE = `謹啓　時下、{施主名}におかれましては益々ご清祥のこととお慶び申し上げます。
日頃より当寺の護持運営につきまして多大なるご理解とご協力を賜り厚く御礼申し上げます。
　さて、本年（{法要期}）は、下記精霊の年回忌法要の正当年に当たっております。

記

一、対象精霊：
{精霊一覧}

一、法要期：{法要期}
一、会場：当山 本堂（またはご自宅・墓前）
一、護持会・志納金等：
　　{集金項目１}
　　{集金項目２}
　　{集金項目３}

　つきましては、万障お繰り合わせの上、ご参列賜りますよう謹んでご案内申し上げます。
　法要のご予約・お塔婆供養のお申込みにつきましては、準備の都合上、ご希望日の二ヶ月前頃までに寺務所へご連絡くださいますようお願い申し上げます。
　時節柄、皆様のご健勝とご多幸を心よりお祈り申し上げます。

合掌`;

export const DEFAULT_A4_GENERAL_TEMPLATE = `謹啓　時下、{施主名}におかれましては益々ご清祥のこととお慶び申し上げます。
平素は{山号} {寺院名}の護持発展に格段のご理解とご協力を賜り、心より御礼申し上げます。
　さて、本年も恒例の法要行事を下記の通り厳修いたします。
　ご先祖様への報恩感謝と追善供養のため、皆様お揃いでご参拝賜りますようご案内申し上げます。

記

一、行事名：{法要期} 合同供養法要
一、場所：当山 本堂
一、該当精霊：
{精霊一覧}
一、集金・志納事項：
　　{集金項目１}
　　{集金項目２}
　　{集金項目３}

※ 卒塔婆のお申込みは一週間前までにお願い申し上げます。

合掌`;

export const INITIAL_NOTICE_TEMPLATES: NoticeTemplateItem[] = [
  {
    id: 'tpl-higan',
    name: '彼岸法要のご案内',
    title: '彼岸法要のご案内',
    type: 'postcard',
    category: 'higan',
    content: DEFAULT_HIGAN_TEMPLATE,
    isDefault: true,
  },
  {
    id: 'tpl-niibon',
    name: '新盆（初盆）法要のご案内',
    title: '新盆法要のご案内',
    type: 'postcard',
    category: 'niibon',
    content: DEFAULT_NIIBON_TEMPLATE,
    isDefault: true,
  },
  {
    id: 'tpl-memorial-card',
    name: '年回忌法要案内（はがき）',
    title: '年回忌法要のご案内',
    type: 'postcard',
    category: 'memorial',
    content: DEFAULT_MEMORIAL_POSTCARD_TEMPLATE,
    isDefault: true,
  },
  {
    id: 'tpl-a4-memorial',
    name: '年回忌法要通知書（A4用紙）',
    title: '年回忌法要のご案内',
    type: 'a4',
    category: 'memorial',
    content: DEFAULT_A4_MEMORIAL_TEMPLATE,
    isDefault: true,
  },
  {
    id: 'tpl-a4-general',
    name: '年中行事・彼岸施餓鬼会案内状（A4用紙）',
    title: '年中行事のご案内',
    type: 'a4',
    category: 'general',
    content: DEFAULT_A4_GENERAL_TEMPLATE,
    isDefault: true,
  },
];

export const TEMPLATE_STORAGE_KEY = 'temple_notice_templates_v1';
export const TEMPLATES_LIST_STORAGE_KEY = 'temple_notice_templates_list_v2';

export function getAllSavedNoticeTemplates(): NoticeTemplateItem[] {
  const loadedList = loadJsonState<NoticeTemplateItem[] | null>(TEMPLATES_LIST_STORAGE_KEY, null);
  if (loadedList && Array.isArray(loadedList) && loadedList.length > 0) {
    return loadedList;
  }

  // Fallback / migrate from v1 if exists
  const loadedV1 = loadJsonState<{ higan?: string; niibon?: string } | null>(TEMPLATE_STORAGE_KEY, null);
  if (loadedV1) {
    const migrated = INITIAL_NOTICE_TEMPLATES.map((t) => {
      if (t.id === 'tpl-higan' && loadedV1.higan) {
        return { ...t, content: loadedV1.higan };
      }
      if (t.id === 'tpl-niibon' && loadedV1.niibon) {
        return { ...t, content: loadedV1.niibon };
      }
      return t;
    });
    return migrated;
  }

  return INITIAL_NOTICE_TEMPLATES;
}

export function saveAllNoticeTemplates(templates: NoticeTemplateItem[]): void {
  saveJsonState(TEMPLATES_LIST_STORAGE_KEY, templates);
  // Also sync legacy v1 keys for compatibility
  const higanTpl = templates.find((t) => t.category === 'higan' || t.id === 'tpl-higan');
  const niibonTpl = templates.find((t) => t.category === 'niibon' || t.id === 'tpl-niibon');
  saveJsonState(TEMPLATE_STORAGE_KEY, {
    higan: higanTpl?.content || DEFAULT_HIGAN_TEMPLATE,
    niibon: niibonTpl?.content || DEFAULT_NIIBON_TEMPLATE,
  });
}

export function getSavedNoticeTemplates(): { higan: string; niibon: string } {
  const list = getAllSavedNoticeTemplates();
  const higanTpl = list.find((t) => t.category === 'higan' || t.id === 'tpl-higan');
  const niibonTpl = list.find((t) => t.category === 'niibon' || t.id === 'tpl-niibon');
  return {
    higan: higanTpl?.content || DEFAULT_HIGAN_TEMPLATE,
    niibon: niibonTpl?.content || DEFAULT_NIIBON_TEMPLATE,
  };
}

export function saveNoticeTemplates(templates: { higan: string; niibon: string } | NoticeTemplateItem[]): void {
  if (Array.isArray(templates)) {
    saveAllNoticeTemplates(templates);
    return;
  }
  saveJsonState(TEMPLATE_STORAGE_KEY, templates);
  const currentList = getAllSavedNoticeTemplates();
  const updatedList = currentList.map((t) => {
    if (t.id === 'tpl-higan' || t.category === 'higan') {
      return { ...t, content: templates.higan };
    }
    if (t.id === 'tpl-niibon' || t.category === 'niibon') {
      return { ...t, content: templates.niibon };
    }
    return t;
  });
  saveJsonState(TEMPLATES_LIST_STORAGE_KEY, updatedList);
}

export interface MemorialNoticeTarget {
  dharmaName: string;
  secularName?: string;
  memorialType: string;
  scheduledDateStr: string;
}

export function formatDharmaNameForNotice(dharmaName?: string, secularName?: string): string {
  if (dharmaName && dharmaName.trim() !== '' && dharmaName !== '（未登録）') {
    return `${dharmaName.trim()} 霊位`;
  }
  if (secularName && secularName.trim() !== '') {
    return `故 ${secularName.trim()} 霊位`;
  }
  return '精霊霊位';
}

export function convertArabicToKanjiInString(text: string): string {
  if (!text) return '';
  return text.replace(/\d+/g, (match) => {
    const num = parseInt(match, 10);
    return !isNaN(num) ? toKanjiNumber(num) : match;
  });
}

/**
 * Converts numbers into formal Japanese ceremonial accounting notation (一金、〇，〇〇〇円也)
 * e.g., 3000 -> "一金、三，〇〇〇円也"
 *       10000 -> "一金、一〇，〇〇〇円也"
 */
export function formatFormalKanjiMoney(amount: number | string): string {
  const num = typeof amount === 'number' ? amount : parseInt(String(amount).replace(/[^0-9]/g, ''), 10);
  if (isNaN(num) || num <= 0) return '';
  const formattedWithCommas = num.toLocaleString('en-US');
  const kanjiDigits: Record<string, string> = {
    '0': '〇', '1': '一', '2': '二', '3': '三', '4': '四',
    '5': '五', '6': '六', '7': '七', '8': '八', '9': '九',
    ',': '，'
  };
  const kanjiAmount = formattedWithCommas.split('').map((c) => kanjiDigits[c] ?? c).join('');
  return `一金、${kanjiAmount}円也`;
}

/**
 * Formats fee tag placeholder {集金項目１}〜{集金項目３}
 * Format: "項目名　一金、三，〇〇〇円也"
 */
export function formatFeeTag(
  slotNum: 1 | 2 | 3,
  templeInfo?: { feeType1?: string; feeType2?: string; feeType3?: string } | null,
  household?: { fee1?: string | number; fee2?: string | number; fee3?: string | number; fee1Amount?: number; fee2Amount?: number; fee3Amount?: number } | null
): string {
  let name = '';
  let amount: number | undefined;

  if (slotNum === 1) {
    name = (templeInfo?.feeType1 || '').trim();
    if (household?.fee1Amount !== undefined && household.fee1Amount > 0) {
      amount = household.fee1Amount;
    } else if (household?.fee1 !== undefined && household.fee1 !== '' && !isNaN(Number(household.fee1))) {
      amount = Number(household.fee1);
    }
  } else if (slotNum === 2) {
    name = (templeInfo?.feeType2 || '').trim();
    if (household?.fee2Amount !== undefined && household.fee2Amount > 0) {
      amount = household.fee2Amount;
    } else if (household?.fee2 !== undefined && household.fee2 !== '' && !isNaN(Number(household.fee2))) {
      amount = Number(household.fee2);
    }
  } else if (slotNum === 3) {
    name = (templeInfo?.feeType3 || '').trim();
    if (household?.fee3Amount !== undefined && household.fee3Amount > 0) {
      amount = household.fee3Amount;
    } else if (household?.fee3 !== undefined && household.fee3 !== '' && !isNaN(Number(household.fee3))) {
      amount = Number(household.fee3);
    }
  }

  if (!name && (amount === undefined || isNaN(amount) || amount <= 0)) {
    return '';
  }

  const displayName = name || `集金項目${toKanjiNumber(slotNum)}`;

  if (amount !== undefined && !isNaN(amount) && amount > 0) {
    const kanjiMoney = formatFormalKanjiMoney(amount);
    return `${displayName}　${kanjiMoney}`;
  }

  return displayName;
}

/**
 * Converts era year numbers in a period label or text into Kanji numerals.
 * e.g. "令和8年 秋彼岸" -> "令和八年 秋彼岸"
 *      "令和10年 新盆" -> "令和十年 新盆"
 *      "令和1年 秋彼岸" -> "令和元年 秋彼岸"
 *      "平成31年" -> "平成三十一年"
 */
export function formatEraYearNumberToKanji(text: string): string {
  if (!text) return '';
  return text.replace(/(令和|平成|昭和|大正|明治|令|平|昭|大|明)?\s*([0-9０-９]+)\s*年/g, (match, era, numStr) => {
    const normalizedDigits = numStr.replace(/[０-９]/g, (s: string) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    const num = parseInt(normalizedDigits, 10);
    if (isNaN(num)) return match;
    const kanjiYear = num === 1 ? '元' : toKanjiNumber(num);
    return `${era || ''}${kanjiYear}年`;
  });
}

/**
 * 世帯から「現在の施主情報（施主名・ふりがな・世帯主との相違）」を取得
 * 家族構成で「施主（isChiefMourner / isSponsor）」にチェックされた人物がいる場合はその人物、
 * いない場合は世帯主（familyHead）の情報を返します。
 */
export interface HouseholdSponsorInfo {
  sponsorName: string;
  furigana: string;
  isDistinctFromHead: boolean;
  householdHead: string;
}

export function getHouseholdSponsorInfo(household?: Household | null): HouseholdSponsorInfo {
  if (!household) {
    return { sponsorName: '', furigana: '', isDistinctFromHead: false, householdHead: '' };
  }
  const headName = (household.familyHead || '').trim();
  const designated = (household.familyMembers || []).find((m) => m.isChiefMourner || m.isSponsor);
  if (designated && designated.name && designated.name.trim() !== '') {
    const isDistinct = designated.name.trim() !== headName;
    return {
      sponsorName: designated.name.trim(),
      furigana: (designated.furigana || household.furigana || '').trim(),
      isDistinctFromHead: isDistinct,
      householdHead: headName,
    };
  }
  return {
    sponsorName: headName,
    furigana: (household.furigana || '').trim(),
    isDistinctFromHead: false,
    householdHead: headName,
  };
}

/**
 * 世帯から「現在の施主名」を取得
 * 家族構成で「施主（isChiefMourner / isSponsor）」にチェックされた人物がいる場合はその人物、
 * いない場合は世帯主（familyHead）を返します。
 */
export function getHouseholdSponsorName(household?: Household | null): string {
  return getHouseholdSponsorInfo(household).sponsorName;
}

/**
 * 施主が施餓鬼塔婆申込済みかどうかを判定
 * 家族構成で「施主（isChiefMourner / isSponsor）」に指定された人物がいる場合、
 * その人物の申込み状態（なければ世帯主の申込み状態）を判定します。
 */
export function isHouseholdSponsorSegakiToba(household?: Household | null): boolean {
  if (!household) return false;
  return isHouseholdSponsorAppliedForToba(household, '施餓鬼塔婆');
}

/**
 * 施主に対する施餓鬼塔婆の申込み状態を切替・設定
 * 「+未申込」ボタン等を押した際、施主指定された家族がいればその家族の塔婆申込み（およびisSegakiToba）をONにし、
 * 世帯主ではなく施主にチェックを付与します。
 */
export function toggleHouseholdSponsorSegakiToba(household: Household, explicitNextVal?: boolean): Household {
  return toggleHouseholdSponsorTobaApplication(household, '施餓鬼塔婆', explicitNextVal);
}

/**
 * 世帯から「世帯主名」を取得
 */
export function getHouseholdFamilyHeadName(household?: Household | null): string {
  return (household?.familyHead || '').trim();
}

/**
 * Applies placeholders to a template string.
 * Supported tags:
 * - {世帯主} / {世帯主名} : 世帯主の氏名（例: 佐藤 謙一様）
 * - {施主} / {施主名} / {檀信徒名} : 施主の氏名（家族構成で施主指定された人物、なければ世帯主。例: 佐藤 太郎様）
 * - {法要期} / {発送区分}
 * - {精霊文章}
 * - {精霊一覧} / ｛精霊一覧｝ : 月日　戒名　霊位　年忌（例: 九月二十三日　釋清純信士　霊位　五十回忌）
 * - {故人名} / ｛故人名｝
 * - {寺院名} / ｛寺院名｝
 * - {山号} / ｛山号｝
 * - {集金項目１} / {集金項目２} / {集金項目３}
 * - {檀信徒QRコード} / {寺院サイトQRコード}
 */
export function applyNoticeTemplate(
  templateStr: string,
  targets: MemorialNoticeTarget[],
  higanPeriodLabel: string = '',
  householdHeadName: string = '',
  templeInfo?: { name?: string; mountainName?: string; feeType1?: string; feeType2?: string; feeType3?: string },
  sponsorName?: string,
  household?: { fee1?: string | number; fee2?: string | number; fee3?: string | number; fee1Amount?: number; fee2Amount?: number; fee3Amount?: number; familyHead?: string } | null
): string {
  if (!templateStr) return '';

  let cleanHead = householdHeadName ? householdHeadName.trim() : (household?.familyHead || '').trim();
  cleanHead = cleanHead.replace(/[\s　]*(様|殿|御中)[\s　]*$/, '').trim();
  const headFormatted = cleanHead !== ''
    ? `${cleanHead}様`
    : '檀信徒の皆様';

  let cleanSponsor = sponsorName ? sponsorName.trim() : '';
  cleanSponsor = cleanSponsor.replace(/[\s　]*(様|殿|御中)[\s　]*$/, '').trim();
  const sponsorFormatted = cleanSponsor !== ''
    ? `${cleanSponsor}様`
    : headFormatted;

  // Format {法要期} / {発送区分} with era year in Kanji (e.g. 令和8年 秋彼岸 -> 令和八年 秋彼岸)
  const cleanPeriod = (higanPeriodLabel || '').replace(/\s*\([78]月盆\)/g, '').trim();
  const periodFormatted = formatEraYearNumberToKanji(cleanPeriod || higanPeriodLabel || '');

  // Format Deceased List (Bullet list) - 「月日　戒名　霊位　年忌」
  const deceasedList = targets.map((t) => {
    const normalized = normalizeDateInput(t.scheduledDateStr);
    const parts = normalized.split('/');
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const monthKanji = !isNaN(m) ? toKanjiNumber(m) : '';
    const dayKanji = !isNaN(d) ? toKanjiNumber(d) : '';
    const dateKanjiStr = (monthKanji && dayKanji) ? `${monthKanji}月${dayKanji}日` : convertArabicToKanjiInString(t.scheduledDateStr);

    let dharmaStr = '';
    if (t.dharmaName && t.dharmaName.trim() !== '' && t.dharmaName !== '（未登録）') {
      dharmaStr = t.dharmaName.trim().replace(/[\s　]*霊位$/, '');
    } else if (t.secularName && t.secularName.trim() !== '') {
      dharmaStr = `故 ${t.secularName.trim()}`.replace(/[\s　]*霊位$/, '');
    } else {
      dharmaStr = '精霊';
    }

    const typeKanji = convertArabicToKanjiInString(t.memorialType);

    // 「月日　戒名　霊位　年忌」の順で全角スペース区切り
    const partsArr = [dateKanjiStr, dharmaStr, '霊位', typeKanji].filter(Boolean);
    return `　　・${partsArr.join('　')}`;
  }).join('\n');

  // Format Spirits Prose Sentence
  const spiritPhrases = targets.map((t, idx) => {
    const normalized = normalizeDateInput(t.scheduledDateStr);
    const parts = normalized.split('/');
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);

    const monthKanji = !isNaN(m) ? toKanjiNumber(m) : '';
    const dayKanji = !isNaN(d) ? toKanjiNumber(d) : '';
    const dateKanjiStr = (monthKanji && dayKanji) ? `${monthKanji}月${dayKanji}日` : convertArabicToKanjiInString(t.scheduledDateStr);

    const nameWithReii = formatDharmaNameForNotice(t.dharmaName, t.secularName);
    const memorialTypeKanji = convertArabicToKanjiInString(t.memorialType);

    if (idx === 0) {
      return `${dateKanjiStr}には${nameWithReii}の${memorialTypeKanji}を`;
    } else {
      return `、更に${dateKanjiStr}には${nameWithReii}の${memorialTypeKanji}を`;
    }
  });

  const spiritsSentence = spiritPhrases.length > 0
    ? `${spiritPhrases.join('')}お迎えすることになります。`
    : '';

  // Primary deceased name (for {故人名})
  const primaryDeceasedName = targets.length > 0
    ? formatDharmaNameForNotice(targets[0].dharmaName, targets[0].secularName)
    : '故人霊位';

  // Fee tag values
  const fee1Formatted = formatFeeTag(1, templeInfo, household);
  const fee2Formatted = formatFeeTag(2, templeInfo, household);
  const fee3Formatted = formatFeeTag(3, templeInfo, household);

  // Replace all tags (supports both half-width {...} and full-width ｛...｝)
  let result = templateStr;
  result = result.replace(/\{世帯主名\}|\{世帯主\}|｛世帯主名｝|｛世帯主｝/g, headFormatted);
  result = result.replace(/\{施主名\}|\{施主\}|\{檀信徒名\}|｛施主名｝|｛施主｝|｛檀信徒名｝/g, sponsorFormatted);
  result = result.replace(/\{法要期\}|\{発送区分\}|｛法要期｝|｛発送区分｝/g, periodFormatted);
  result = result.replace(/\{精霊文章\}|｛精霊文章｝/g, spiritsSentence);
  result = result.replace(/\{精霊一覧\}|｛精霊一覧｝/g, deceasedList);
  result = result.replace(/\{故人名\}|｛故人名｝/g, primaryDeceasedName);
  result = result.replace(/\{寺院名\}|｛寺院名｝/g, templeInfo?.name || '当寺');
  result = result.replace(/\{山号\}|｛山号｝/g, templeInfo?.mountainName || '当山');
  result = result.replace(/\{集金項目１\}|\{集金項目1\}|｛集金項目１｝|｛集金項目1｝/g, fee1Formatted);
  result = result.replace(/\{集金項目２\}|\{集金項目2\}|｛集金項目２｝|｛集金項目2｝/g, fee2Formatted);
  result = result.replace(/\{集金項目３\}|\{集金項目3\}|｛集金項目３｝|｛集金項目3｝/g, fee3Formatted);
  result = result.replace(/\{檀信徒QRコード\}|\{檀信徒QR\}|｛檀信徒QRコード｝|｛檀信徒QR｝|\{檀家QRコード\}|\{檀家QR\}|｛檀家QRコード｝|｛檀家QR｝|\{受付QRコード\}|\{受付QR\}|｛受付QRコード｝|｛受付QR｝/g, '[[QR_HOUSEHOLD]]');
  result = result.replace(/\{寺院サイトQRコード\}|\{寺院QRコード\}|\{寺院QR\}|｛寺院サイトQRコード｝|｛寺院QRコード｝|｛寺院QR｝|\{公式HP_QRコード\}|｛公式HP_QRコード｝/g, '[[QR_TEMPLE]]');

  return result;
}

/**
 * Generates polite formal memorial service notice letter text.
 * Uses saved custom template if available, falling back to defaults.
 */
export function generatePoliteMemorialNoticeText(
  targets: MemorialNoticeTarget[],
  higanPeriodLabel: string = '',
  householdHeadName: string = '',
  templeInfo?: { name?: string; mountainName?: string; feeType1?: string; feeType2?: string; feeType3?: string },
  customTemplateOverride?: string,
  sponsorName?: string,
  household?: { fee1?: string | number; fee2?: string | number; fee3?: string | number; fee1Amount?: number; fee2Amount?: number; fee3Amount?: number; familyHead?: string } | null
): string {
  if (!targets || targets.length === 0) return '';

  const isNiibon = higanPeriodLabel.includes('新盆') || targets.some((t) => t.memorialType.includes('新盆'));
  const templates = getSavedNoticeTemplates();

  const selectedTemplate = customTemplateOverride || (isNiibon ? templates.niibon : templates.higan);

  return applyNoticeTemplate(
    selectedTemplate,
    targets,
    higanPeriodLabel,
    householdHeadName,
    templeInfo,
    sponsorName,
    household
  );
}

/**
 * 閏年（うるう年）判定
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Calculates memorial service milestones given a death date (YYYY/MM/DD or flexible)
 * 閏年2月29日命日の精霊は、平年においては2月28日命日として計算
 */
export function calculateMemorialMilestones(deathDateStr: string): MemorialMilestone[] {
  if (!deathDateStr) return [];
  const normalized = normalizeDateInput(deathDateStr);
  const parts = normalized.split('/');
  if (parts.length !== 3) return [];

  const yearNum = parseInt(parts[0], 10);
  const monthNum = parseInt(parts[1], 10) - 1;
  const dayNum = parseInt(parts[2], 10);

  const deathDate = new Date(yearNum, monthNum, dayNum);
  if (isNaN(deathDate.getTime())) return [];

  const deathYear = deathDate.getFullYear();
  const currentYear = new Date().getFullYear();
  const isLeapDayDeath = (monthNum === 1 && dayNum === 29); // 2月29日没

  const milestonesConfig: { type: MemorialMilestoneType; addYears: number; yearNum: number }[] = [
    { type: '一周忌', addYears: 1, yearNum: 1 },
    { type: '三回忌', addYears: 2, yearNum: 3 },
    { type: '七回忌', addYears: 6, yearNum: 7 },
    { type: '十三回忌', addYears: 12, yearNum: 13 },
    { type: '十七回忌', addYears: 16, yearNum: 17 },
    { type: '二十三回忌', addYears: 22, yearNum: 23 },
    { type: '二十七回忌', addYears: 26, yearNum: 27 },
    { type: '三十三回忌', addYears: 32, yearNum: 33 },
    { type: '三十七回忌', addYears: 36, yearNum: 37 },
    { type: '五十回忌', addYears: 49, yearNum: 50 },
    { type: '百回忌', addYears: 99, yearNum: 100 },
    { type: '百五十回忌', addYears: 149, yearNum: 150 },
    { type: '二百回忌', addYears: 199, yearNum: 200 },
  ];

  // 二百回忌以降の50年ごとの回忌（250回忌〜2000回忌）を追加
  for (let y = 250; y <= 2000; y += 50) {
    const kanjiName = `${toKanjiNumber(y)}回忌`;
    milestonesConfig.push({
      type: kanjiName as MemorialMilestoneType,
      addYears: y - 1,
      yearNum: y,
    });
  }

  return milestonesConfig.map((item) => {
    const targetYear = deathYear + item.addYears;
    
    // うるう年の2月29日命日の精霊の扱い:
    // うるう年以外の年（平年）では2月28日命日とする
    let targetMonth = monthNum;
    let targetDay = dayNum;
    if (isLeapDayDeath) {
      if (isLeapYear(targetYear)) {
        targetMonth = 1;
        targetDay = 29;
      } else {
        targetMonth = 1;
        targetDay = 28;
      }
    }

    const scheduledDateObj = new Date(targetYear, targetMonth, targetDay);

    const yearStr = scheduledDateObj.getFullYear();
    const monthStr = String(scheduledDateObj.getMonth() + 1).padStart(2, '0');
    const dayStr = String(scheduledDateObj.getDate()).padStart(2, '0');
    const scheduledDate = `${yearStr}/${monthStr}/${dayStr}`;

    const isPast = targetYear < currentYear;
    const isCurrentYear = targetYear === currentYear;
    const isNextYear = targetYear === currentYear + 1;

    return {
      type: item.type,
      yearNumber: item.yearNum,
      targetYear,
      scheduledDate,
      japaneseEra: `${getJapaneseEra(targetYear, scheduledDateObj.getMonth() + 1, scheduledDateObj.getDate())} (${targetYear}年)`,
      isPast,
      isCurrentYear,
      isNextYear,
    };
  });
}

export interface DailyMemorialItem {
  pastRecord: any; // PastRecord
  household?: any; // Household
  memorialTypeLabel: string; // 例: '初七日忌', '四十九日忌', '祥月命日'
  category: '中陰' | '百ヶ日' | '祥月命日' | '年回忌';
  description: string; // 例: '没後49日目 (2026/06/23 昇天)'
  deathDateStr: string;
  countDay?: number;
  passedYears?: number;
}

/**
 * Calculates spirits that require memorial services on a specific target date (Today, Tomorrow, Day after, etc.)
 * 閏年2月29日命日の精霊は、平年においては2月28日命日として判定・抽出
 */
export function getDailyMemorialTargets(
  pastRecords: any[],
  households: any[],
  targetDate: Date
): DailyMemorialItem[] {
  if (!pastRecords || pastRecords.length === 0) return [];

  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth() + 1;
  const targetDay = targetDate.getDate();
  const isTargetLeap = isLeapYear(targetYear);

  const targetUtc = Date.UTC(targetYear, targetMonth - 1, targetDay);

  const householdMap = new Map<string, any>();
  households.forEach((h) => {
    if (h && h.id) householdMap.set(h.id, h);
  });

  const items: DailyMemorialItem[] = [];

  pastRecords.forEach((record) => {
    if (!record || !record.deathDate) return;
    const normalized = normalizeDateInput(record.deathDate);
    const parts = normalized.split('/');
    if (parts.length !== 3) return;

    const deathYear = parseInt(parts[0], 10);
    const deathMonth = parseInt(parts[1], 10);
    const deathDay = parseInt(parts[2], 10);

    if (isNaN(deathYear) || isNaN(deathMonth) || isNaN(deathDay)) return;

    const deathUtc = Date.UTC(deathYear, deathMonth - 1, deathDay);
    const diffDays = Math.round((targetUtc - deathUtc) / (1000 * 60 * 60 * 24));
    const countDay = diffDays + 1; // 死亡日当日が1日目 (命日)

    const household = householdMap.get(record.householdId);

    // 1. 中陰法要・忌日チェック
    let memorialTypeLabel = '';
    let category: '中陰' | '百ヶ日' | '祥月命日' | '年回忌' = '中陰';

    if (countDay === 7) memorialTypeLabel = '初七日忌 (7日目)';
    else if (countDay === 14) memorialTypeLabel = '二七日忌 (14日目)';
    else if (countDay === 21) memorialTypeLabel = '三七日忌 (21日目)';
    else if (countDay === 28) memorialTypeLabel = '四七日忌 (28日目)';
    else if (countDay === 35) memorialTypeLabel = '五七日忌 (三十五日忌)';
    else if (countDay === 42) memorialTypeLabel = '六七日忌 (42日目)';
    else if (countDay === 49) memorialTypeLabel = '七七日忌 (四十九日忌・満中陰)';
    else if (countDay === 100) {
      memorialTypeLabel = '百ヶ日忌 (100日目)';
      category = '百ヶ日';
    }

    if (memorialTypeLabel) {
      items.push({
        pastRecord: record,
        household,
        memorialTypeLabel,
        category,
        description: `命日: ${normalized} (${countDay}日目)`,
        deathDateStr: normalized,
        countDay,
      });
      return;
    }

    // 2. 祥月命日 ＆ 当日該当する年回忌チェック
    // うるう年の2月29日命日の精霊の扱い:
    // うるう年以外の平年では2月28日命日として処理
    let isAnniversaryMatch = false;
    if (deathMonth === 2 && deathDay === 29) {
      if (isTargetLeap) {
        isAnniversaryMatch = (targetMonth === 2 && targetDay === 29);
      } else {
        isAnniversaryMatch = (targetMonth === 2 && targetDay === 28);
      }
    } else {
      isAnniversaryMatch = (deathMonth === targetMonth && deathDay === targetDay);
    }

    if (isAnniversaryMatch && deathYear < targetYear) {
      const passedYears = targetYear - deathYear;
      let label = `祥月命日 (没後${passedYears}年)`;
      let cat: '祥月命日' | '年回忌' = '祥月命日';

      if (passedYears === 1) { label = '一周忌 (祥月命日)'; cat = '年回忌'; }
      else if (passedYears === 2) { label = '三回忌 (祥月命日)'; cat = '年回忌'; }
      else if (passedYears === 6) { label = '七回忌 (祥月命日)'; cat = '年回忌'; }
      else if (passedYears === 12) { label = '十三回忌 (祥月命日)'; cat = '年回忌'; }
      else if (passedYears === 16) { label = '十七回忌 (祥月命日)'; cat = '年回忌'; }
      else if (passedYears === 22) { label = '二十三回忌 (祥月命日)'; cat = '年回忌'; }
      else if (passedYears === 26) { label = '二十七回忌 (祥月命日)'; cat = '年回忌'; }
      else if (passedYears === 32) { label = '三十三回忌 (祥月命日)'; cat = '年回忌'; }
      else if (passedYears === 49) { label = '五十回忌 (祥月命日)'; cat = '年回忌'; }
      else if (passedYears === 99) { label = '百回忌 (祥月命日)'; cat = '年回忌'; }
      else if (passedYears === 199) { label = '二百回忌 (祥月命日)'; cat = '年回忌'; }
      else if ((passedYears + 1) % 100 === 0 && (passedYears + 1) >= 300) {
        const yearCount = passedYears + 1;
        label = `${toKanjiNumber(yearCount)}回忌 (祥月命日)`;
        cat = '年回忌';
      }

      const anniversaryDisplay = (deathMonth === 2 && deathDay === 29 && !isTargetLeap)
        ? '2月28日 (平年)'
        : `${deathMonth}月${deathDay}日`;

      items.push({
        pastRecord: record,
        household,
        memorialTypeLabel: label,
        category: cat,
        description: `命日: ${anniversaryDisplay} (没年月日: ${normalized})`,
        deathDateStr: normalized,
        passedYears,
      });
    }
  });

  // Sort items by closest death date first (most recent death date descending)
  items.sort((a, b) => {
    const normA = normalizeDateInput(a.deathDateStr || a.pastRecord?.deathDate || '');
    const normB = normalizeDateInput(b.deathDateStr || b.pastRecord?.deathDate || '');
    const timeA = new Date(normA.replace(/\//g, '-')).getTime() || 0;
    const timeB = new Date(normB.replace(/\//g, '-')).getTime() || 0;
    return timeB - timeA;
  });

  return items;
}

/**
 * Replaces all arabic number sequences in a text with Kanji numbers.
 * Special handling for Japanese year "1年" -> "元年".
 */
export function convertTextNumbersToKanji(text: string): string {
  if (!text) return '';
  
  // Replace standalone "1年" with "元年" (e.g. "平成1年" -> "平成元年", but NOT "平成11年" or "平成21年")
  let converted = text.replace(/(^|[^\d])1年/g, '$1元年');
  
  return converted.replace(/\d+/g, (match) => {
    const val = parseInt(match, 10);
    return toKanjiNumber(val);
  });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);
}

/**
 * Sorts an array of Household objects by the specified sort key and order,
 * respecting the ordering defined in MasterOptions for household types, statuses, and districts.
 */
export function sortHouseholds(
  households: Household[],
  sortKey: string = 'id',
  sortOrder: 'asc' | 'desc' = 'asc',
  masterOptions?: MasterOptions,
  pastRecords?: PastRecord[],
  bonSeason?: string,
  selectedTobaType: string = '施餓鬼塔婆',
  activeFeeSlot?: 1 | 2 | 3 | string,
  transactions?: Transaction[]
): Household[] {
  return [...households].sort((a, b) => {
    let cmp = 0;

    if (sortKey === 'address') {
      const cleanA = (a.postalCode || '').replace(/[^0-9a-zA-Z]/g, '').trim();
      const cleanB = (b.postalCode || '').replace(/[^0-9a-zA-Z]/g, '').trim();
      const hasA = cleanA.length > 0;
      const hasB = cleanB.length > 0;

      // 郵便番号に何も記載されていない場合、レコードは常に一番下に配置
      if (!hasA && !hasB) {
        cmp = (a.address || '').localeCompare(b.address || '', 'ja', { numeric: true });
        if (cmp === 0) {
          cmp = (a.id || '').localeCompare(b.id || '', 'ja', { numeric: true });
        }
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      if (!hasA) {
        // aのみ郵便番号未記載 -> aを末尾に
        return 1;
      }
      if (!hasB) {
        // bのみ郵便番号未記載 -> bを末尾に
        return -1;
      }

      // 両方とも郵便番号あり -> 郵便番号順にソート
      cmp = cleanA.localeCompare(cleanB, 'ja', { numeric: true });
      if (cmp === 0) {
        cmp = (a.address || '').localeCompare(b.address || '', 'ja', { numeric: true });
      }
      if (cmp === 0) {
        cmp = (a.id || '').localeCompare(b.id || '', 'ja', { numeric: true });
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    } else if (sortKey === 'householdType' && masterOptions?.householdTypes && masterOptions.householdTypes.length > 0) {
      const idxA = masterOptions.householdTypes.indexOf(a.householdType || '');
      const idxB = masterOptions.householdTypes.indexOf(b.householdType || '');
      if (idxA !== -1 && idxB !== -1) {
        cmp = idxA - idxB;
      } else if (idxA !== -1) {
        cmp = -1;
      } else if (idxB !== -1) {
        cmp = 1;
      } else {
        cmp = (a.householdType || '').localeCompare(b.householdType || '', 'ja');
      }
    } else if (sortKey === 'status' && masterOptions?.statuses && masterOptions.statuses.length > 0) {
      const idxA = masterOptions.statuses.indexOf(a.status || '');
      const idxB = masterOptions.statuses.indexOf(b.status || '');
      if (idxA !== -1 && idxB !== -1) {
        cmp = idxA - idxB;
      } else if (idxA !== -1) {
        cmp = -1;
      } else if (idxB !== -1) {
        cmp = 1;
      } else {
        cmp = (a.status || '').localeCompare(b.status || '', 'ja');
      }
    } else if (sortKey === 'district' && masterOptions?.districts && masterOptions.districts.length > 0) {
      const idxA = masterOptions.districts.indexOf(a.district || '');
      const idxB = masterOptions.districts.indexOf(b.district || '');
      if (idxA !== -1 && idxB !== -1) {
        cmp = idxA - idxB;
      } else if (idxA !== -1) {
        cmp = -1;
      } else if (idxB !== -1) {
        cmp = 1;
      } else {
        cmp = (a.district || '').localeCompare(b.district || '', 'ja');
      }
    } else if (sortKey === 'niibon') {
      const statusA = getHouseholdNiibonStatus(pastRecords || [], a.id, (bonSeason as any) || '8月盆');
      const statusB = getHouseholdNiibonStatus(pastRecords || [], b.id, (bonSeason as any) || '8月盆');
      const getRank = (st: typeof statusA) => {
        if (st.isCurrentYearNiibon) return 1;
        if (st.isNextYearNiibon) return 2;
        return 3;
      };
      const rankA = getRank(statusA);
      const rankB = getRank(statusB);
      cmp = rankA - rankB;
      if (cmp === 0) {
        cmp = compareHouseholdsGojuon(a, b);
      }
    } else if (sortKey === 'isSegakiToba' || sortKey === 'tobaApplication' || sortKey === 'segakiToba') {
      const tobaA = isHouseholdAppliedForToba(a, selectedTobaType) ? 1 : 2;
      const tobaB = isHouseholdAppliedForToba(b, selectedTobaType) ? 1 : 2;
      cmp = tobaA - tobaB;
      if (cmp === 0) {
        cmp = compareHouseholdsGojuon(a, b);
      }
    } else if (sortKey === 'tanagyoMonthlyVisit' || sortKey === 'tanagyo') {
      const tanagyoA = a.tanagyoMonthlyVisit ? 1 : 2;
      const tanagyoB = b.tanagyoMonthlyVisit ? 1 : 2;
      cmp = tanagyoA - tanagyoB;
      if (cmp === 0) {
        cmp = compareHouseholdsGojuon(a, b);
      }
    } else if (sortKey === 'feeAmount' || sortKey === 'fee1' || sortKey === 'fee2' || sortKey === 'fee3') {
      const getFeeVal = (h: Household) => {
        const slot = activeFeeSlot === 2 || sortKey === 'fee2' ? 2 : (activeFeeSlot === 3 || sortKey === 'fee3' ? 3 : 1);
        if (slot === 1) {
          if (h.fee1Amount !== undefined) return h.fee1Amount;
          if (h.fee1 !== undefined && h.fee1 !== '') return Number(h.fee1) || 0;
        } else if (slot === 2) {
          if (h.fee2Amount !== undefined) return h.fee2Amount;
          if (h.fee2 !== undefined && h.fee2 !== '') return Number(h.fee2) || 0;
        } else if (slot === 3) {
          if (h.fee3Amount !== undefined) return h.fee3Amount;
          if (h.fee3 !== undefined && h.fee3 !== '') return Number(h.fee3) || 0;
        }
        return -1; // 未設定
      };
      const feeA = getFeeVal(a);
      const feeB = getFeeVal(b);
      if (feeA === -1 && feeB === -1) {
        cmp = compareHouseholdsGojuon(a, b);
      } else if (feeA === -1) {
        cmp = 1;
      } else if (feeB === -1) {
        cmp = -1;
      } else {
        cmp = feeA - feeB;
        if (cmp === 0) {
          cmp = compareHouseholdsGojuon(a, b);
        }
      }
    } else {
      let aVal = '';
      let bVal = '';

      switch (sortKey) {
        case 'familyHead': {
          const sponsorInfoA = getHouseholdSponsorInfo(a);
          const sponsorInfoB = getHouseholdSponsorInfo(b);
          aVal = normalizeFurigana(sponsorInfoA.furigana).trim() || sponsorInfoA.sponsorName;
          bVal = normalizeFurigana(sponsorInfoB.furigana).trim() || sponsorInfoB.sponsorName;
          break;
        }
        case 'familyHeadName':
          aVal = a.familyHead || '';
          bVal = b.familyHead || '';
          break;
        case 'phone':
          aVal = a.phone || '';
          bVal = b.phone || '';
          break;
        case 'mobile':
          aVal = a.mobile || '';
          bVal = b.mobile || '';
          break;
        case 'tamegaki': {
          const tobaA = getHouseholdSponsorTobaApplication(a, selectedTobaType);
          const tobaB = getHouseholdSponsorTobaApplication(b, selectedTobaType);
          aVal = tobaA.tamegaki || '';
          bVal = tobaB.tamegaki || '';
          break;
        }
        case 'notes':
          aVal = a.notes || '';
          bVal = b.notes || '';
          break;
        case 'pastCount': {
          const countA = (pastRecords || []).filter((p) => p.householdId === a.id).length;
          const countB = (pastRecords || []).filter((p) => p.householdId === b.id).length;
          cmp = countA - countB;
          return sortOrder === 'asc' ? cmp : -cmp;
        }
        case 'accountingCount': {
          const countA = (transactions || []).filter((t) => t.householdId === a.id).length;
          const countB = (transactions || []).filter((t) => t.householdId === b.id).length;
          cmp = countA - countB;
          return sortOrder === 'asc' ? cmp : -cmp;
        }
        case 'address':
          aVal = a.address || '';
          bVal = b.address || '';
          break;
        case 'householdType':
          aVal = a.householdType || '';
          bVal = b.householdType || '';
          break;
        case 'status':
          aVal = a.status || '';
          bVal = b.status || '';
          break;
        case 'district':
          aVal = a.district || '';
          bVal = b.district || '';
          break;
        case 'tombNumber':
          aVal = a.tombNumber || '';
          bVal = b.tombNumber || '';
          break;
        case 'id':
        default:
          aVal = a.id || '';
          bVal = b.id || '';
          break;
      }

      cmp = aVal.localeCompare(bVal, 'ja', { numeric: true });
    }

    if (cmp === 0 && sortKey !== 'id') {
      cmp = (a.id || '').localeCompare(b.id || '', 'ja', { numeric: true });
    }

    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

/**
 * Compares two households in Japanese alphabetical order (五十音順)
 * Prioritizes normalized furigana, then familyHead, then ID.
 */
export function compareHouseholdsGojuon(a: Household, b: Household): number {
  const spA = getHouseholdSponsorInfo(a);
  const spB = getHouseholdSponsorInfo(b);
  const aKey = normalizeFurigana(spA.furigana || (a as any).kana || '').trim() || spA.sponsorName;
  const bKey = normalizeFurigana(spB.furigana || (b as any).kana || '').trim() || spB.sponsorName;

  const cmp = aKey.localeCompare(bKey, 'ja', { numeric: true });
  if (cmp !== 0) return cmp;

  const sponsorNameCmp = spA.sponsorName.localeCompare(spB.sponsorName, 'ja', { numeric: true });
  if (sponsorNameCmp !== 0) return sponsorNameCmp;

  const headCmp = (a.familyHead || '').localeCompare(b.familyHead || '', 'ja', { numeric: true });
  if (headCmp !== 0) return headCmp;

  return (a.id || '').localeCompare(b.id || '', 'ja', { numeric: true });
}

/**
 * Sorts households in Japanese alphabetical order (五十音順).
 */
export function sortHouseholdsByGojuon(households: Household[]): Household[] {
  return [...households].sort(compareHouseholdsGojuon);
}

/**
 * Japanese Kana Rows and Individual Character mappings for 2-step index filtering
 */
export const KANA_ROWS = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ'] as const;

export const KANA_ROW_MAP: Record<string, string[]> = {
  'あ': ['あ', 'い', 'う', 'え', 'お'],
  'か': ['か', 'き', 'く', 'け', 'こ'],
  'さ': ['さ', 'し', 'す', 'せ', 'そ'],
  'た': ['た', 'ち', 'つ', 'て', 'と'],
  'な': ['な', 'に', 'ぬ', 'ね', 'の'],
  'は': ['は', 'ひ', 'ふ', 'へ', 'ほ'],
  'ま': ['ま', 'み', 'む', 'め', 'も'],
  'や': ['や', 'ゆ', 'よ'],
  'ら': ['ら', 'り', 'る', 'れ', 'ろ'],
  'わ': ['わ', 'を', 'ん'],
};

/**
 * Returns the kana row (あ・か・さ・た・な・は・ま・や・ら・わ・他) for a furigana/name string.
 */
export function getKanaRow(furiganaOrName: string): string {
  const norm = normalizeFurigana(furiganaOrName).trim();
  if (!norm) return '他';
  const firstChar = norm.charAt(0);
  if (/[あ-おぁ-ぉ]/.test(firstChar)) return 'あ';
  if (/[か-ご]/.test(firstChar)) return 'か';
  if (/[さ-ぞ]/.test(firstChar)) return 'さ';
  if (/[た-どっ]/.test(firstChar)) return 'た';
  if (/[な-の]/.test(firstChar)) return 'な';
  if (/[は-ぽ]/.test(firstChar)) return 'は';
  if (/[ま-も]/.test(firstChar)) return 'ま';
  if (/[や-よゃ-ょ]/.test(firstChar)) return 'や';
  if (/[ら-ろ]/.test(firstChar)) return 'ら';
  if (/[わ-ん]/.test(firstChar)) return 'わ';
  return '他';
}

/**
 * Returns the specific kana character column (あ・い・う・え・お etc.) within the row.
 */
export function getKanaColumn(furiganaOrName: string): string {
  const norm = normalizeFurigana(furiganaOrName).trim();
  if (!norm) return '';
  const firstChar = norm.charAt(0);
  
  if (/[あぁ]/.test(firstChar)) return 'あ';
  if (/[いい]/.test(firstChar)) return 'い';
  if (/[うぅゔ]/.test(firstChar)) return 'う';
  if (/[えぇ]/.test(firstChar)) return 'え';
  if (/[おぉ]/.test(firstChar)) return 'お';

  if (/[かが]/.test(firstChar)) return 'か';
  if (/[きぎ]/.test(firstChar)) return 'き';
  if (/[くぐ]/.test(firstChar)) return 'く';
  if (/[けげ]/.test(firstChar)) return 'け';
  if (/[こご]/.test(firstChar)) return 'こ';

  if (/[さざ]/.test(firstChar)) return 'さ';
  if (/[しじ]/.test(firstChar)) return 'し';
  if (/[すず]/.test(firstChar)) return 'す';
  if (/[せぜ]/.test(firstChar)) return 'せ';
  if (/[そぞ]/.test(firstChar)) return 'そ';

  if (/[ただ]/.test(firstChar)) return 'た';
  if (/[ちぢ]/.test(firstChar)) return 'ち';
  if (/[つづっ]/.test(firstChar)) return 'つ';
  if (/[てで]/.test(firstChar)) return 'て';
  if (/[とど]/.test(firstChar)) return 'と';

  if (firstChar === 'な') return 'な';
  if (firstChar === 'に') return 'に';
  if (firstChar === 'ぬ') return 'ぬ';
  if (firstChar === 'ね') return 'ね';
  if (firstChar === 'の') return 'の';

  if (/[はばぱ]/.test(firstChar)) return 'は';
  if (/[ひびぴ]/.test(firstChar)) return 'ひ';
  if (/[ふぶぷ]/.test(firstChar)) return 'ふ';
  if (/[へべぺ]/.test(firstChar)) return 'へ';
  if (/[ほぼぽ]/.test(firstChar)) return 'ほ';

  if (firstChar === 'ま') return 'ま';
  if (firstChar === 'み') return 'み';
  if (firstChar === 'む') return 'む';
  if (firstChar === 'め') return 'め';
  if (firstChar === 'も') return 'も';

  if (/[やや]/.test(firstChar)) return 'や';
  if (/[ゆゆ]/.test(firstChar)) return 'ゆ';
  if (/[よよ]/.test(firstChar)) return 'よ';

  if (firstChar === 'ら') return 'ら';
  if (firstChar === 'り') return 'り';
  if (firstChar === 'る') return 'る';
  if (firstChar === 'れ') return 'れ';
  if (firstChar === 'ろ') return 'ろ';

  if (/[わゎ]/.test(firstChar)) return 'わ';
  if (firstChar === 'を') return 'を';
  if (firstChar === 'ん') return 'ん';

  return '';
}

export interface YearlyMemorialSpirit {
  id: string;
  record: any; // PastRecord
  memorialType: string; // '四十九日忌' | '百ヶ日忌' | '一周忌' | '三回忌' | ...
  yearNumber?: number; // 1, 3, 7, 13, 17, 23, 27, 33, 37, 50, 100, 150, 200, 250, 300...
  category: '中陰' | '百ヶ日' | '年回忌';
  scheduledDate: string; // YYYY/MM/DD
  deathDateNormalized: string; // YYYY/MM/DD
  japaneseEra: string;
}

export interface NenkiFilterSettings {
  include49Days: boolean;
  include100Days: boolean;
  enabledMilestones: Record<string, boolean>;
  after200Mode: 'every100' | 'every50' | 'none'; // 百年間隔, 五十年間隔, 表示しない
}

export const DEFAULT_NENKI_FILTER_SETTINGS: NenkiFilterSettings = {
  include49Days: true,
  include100Days: true,
  enabledMilestones: {
    '一周忌': true,
    '三回忌': true,
    '七回忌': true,
    '十三回忌': true,
    '十七回忌': true,
    '二十三回忌': true,
    '二十七回忌': true,
    '三十三回忌': true,
    '三十七回忌': false,
    '五十回忌': true,
    '百回忌': true,
    '百五十回忌': false,
    '二百回忌': true,
  },
  after200Mode: 'every100',
};

/**
 * 霊位が年忌設定の条件に一致するかどうかを判定
 */
export function isSpiritMatchingNenkiSettings(
  spirit: YearlyMemorialSpirit,
  settings: NenkiFilterSettings = DEFAULT_NENKI_FILTER_SETTINGS
): boolean {
  if (!spirit) return false;

  if (spirit.memorialType === '四十九日忌') {
    return settings.include49Days;
  }
  if (spirit.memorialType === '百ヶ日忌') {
    return settings.include100Days;
  }

  const type = spirit.memorialType;
  const yearNum = spirit.yearNumber;

  // 定義済みの主要年忌（一周忌〜二百回忌など）
  if (type in settings.enabledMilestones) {
    return Boolean(settings.enabledMilestones[type]);
  }

  // 二百回忌以降（二百五十回忌、三百回忌、四百回忌など）
  if (yearNum && yearNum >= 200) {
    if (yearNum === 200) {
      return Boolean(settings.enabledMilestones['二百回忌']);
    }
    if (settings.after200Mode === 'none') {
      return false;
    }
    if (settings.after200Mode === 'every100') {
      return yearNum % 100 === 0;
    }
    if (settings.after200Mode === 'every50') {
      return yearNum % 50 === 0;
    }
    return false;
  }

  // 未定義の年忌はデフォルトでtrue
  return true;
}

/**
 * 指定された年（例: 2025, 2026, 2027）における、精霊ごとの四十九日、百ヶ日、および年回忌（一周忌〜百回忌以降）を算出
 */
export function calculateYearlyMemorialSpirits(
  pastRecords: any[],
  targetYear: number
): YearlyMemorialSpirit[] {
  if (!pastRecords || pastRecords.length === 0) return [];

  const results: YearlyMemorialSpirit[] = [];

  pastRecords.forEach((record) => {
    if (!record || !record.deathDate) return;
    const normalized = normalizeDateInput(record.deathDate);
    if (!normalized) return;
    const parts = normalized.split('/');
    if (parts.length !== 3) return;

    const deathYear = parseInt(parts[0], 10);
    const deathMonth = parseInt(parts[1], 10);
    const deathDay = parseInt(parts[2], 10);
    if (isNaN(deathYear) || isNaN(deathMonth) || isNaN(deathDay)) return;

    // 1. 四十九日 (49日目: 命日を1日目として+48日)
    const d49 = new Date(deathYear, deathMonth - 1, deathDay);
    d49.setDate(d49.getDate() + 48);
    if (d49.getFullYear() === targetYear) {
      const mStr = String(d49.getMonth() + 1).padStart(2, '0');
      const dStr = String(d49.getDate()).padStart(2, '0');
      const scheduledDate = `${targetYear}/${mStr}/${dStr}`;
      results.push({
        id: `${record.id}-49days-${scheduledDate}`,
        record,
        memorialType: '四十九日忌',
        yearNumber: 0,
        category: '中陰',
        scheduledDate,
        deathDateNormalized: normalized,
        japaneseEra: `${getJapaneseEra(targetYear, d49.getMonth() + 1, d49.getDate())}`,
      });
    }

    // 2. 百ヶ日 (100日目: 命日を1日目として+99日)
    const d100 = new Date(deathYear, deathMonth - 1, deathDay);
    d100.setDate(d100.getDate() + 99);
    if (d100.getFullYear() === targetYear) {
      const mStr = String(d100.getMonth() + 1).padStart(2, '0');
      const dStr = String(d100.getDate()).padStart(2, '0');
      const scheduledDate = `${targetYear}/${mStr}/${dStr}`;
      results.push({
        id: `${record.id}-100days-${scheduledDate}`,
        record,
        memorialType: '百ヶ日忌',
        yearNumber: 0,
        category: '百ヶ日',
        scheduledDate,
        deathDateNormalized: normalized,
        japaneseEra: `${getJapaneseEra(targetYear, d100.getMonth() + 1, d100.getDate())}`,
      });
    }

    // 3. 年回忌 (一周忌、三回忌、七回忌、十三回忌、十七回忌、二十三回忌、二十七回忌、三十三回忌、五十回忌、百回忌、二百回忌...)
    const milestones = calculateMemorialMilestones(record.deathDate);
    milestones.forEach((m) => {
      if (m.targetYear === targetYear) {
        results.push({
          id: `${record.id}-${m.type}-${m.scheduledDate}`,
          record,
          memorialType: m.type,
          yearNumber: m.yearNumber,
          category: '年回忌',
          scheduledDate: m.scheduledDate,
          deathDateNormalized: normalized,
          japaneseEra: m.japaneseEra,
        });
      }
    });
  });

  // 予定日の昇順でソート（同じ日付なら戒名順）
  results.sort((a, b) => {
    const dateComp = a.scheduledDate.localeCompare(b.scheduledDate);
    if (dateComp !== 0) return dateComp;
    return (a.record.dharmaName || '').localeCompare(b.record.dharmaName || '');
  });

  return results;
}

export interface UpcomingMemorialCandidate {
  id: string;
  record: any; // PastRecord
  household?: any; // Household
  memorialType: string;
  category: '中陰' | '百ヶ日' | '年回忌' | '祥月命日';
  scheduledDate: string; // YYYY/MM/DD
  deathDateNormalized: string;
  daysUntil: number; // 基準日からの日数 (0: 当日, 正数: 将来)
  description: string;
}

/**
 * 基準日（例: カレンダー選択日や本日）から向こうN日間（デフォルト65日≒約2ヶ月）に迎える
 * 四十九日、百ヶ日、一周忌、三回忌〜各回忌などの忌日・年忌候補を時系列順に抽出
 */
export function calculateUpcomingMilestonesRange(
  pastRecords: any[],
  households: any[],
  baseDateStr?: string,
  daysAhead: number = 65
): UpcomingMemorialCandidate[] {
  if (!pastRecords || pastRecords.length === 0) return [];

  const normBase = normalizeDateInput(baseDateStr || '');
  let baseDateObj = new Date();
  if (normBase) {
    const parts = normBase.split('/');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        baseDateObj = new Date(y, m - 1, d);
      }
    }
  }

  const baseY = baseDateObj.getFullYear();
  const baseM = baseDateObj.getMonth();
  const baseD = baseDateObj.getDate();

  const startUtc = Date.UTC(baseY, baseM, baseD);
  const endUtc = startUtc + daysAhead * 24 * 60 * 60 * 1000;

  const householdMap = new Map<string, any>();
  if (households && households.length > 0) {
    households.forEach((h) => {
      if (h && h.id) householdMap.set(h.id, h);
    });
  }

  const candidates: UpcomingMemorialCandidate[] = [];

  // Config for chuin (中陰) days
  const chuinDays: { daysToAdd: number; label: string; cat: '中陰' | '百ヶ日' }[] = [
    { daysToAdd: 6, label: '初七日忌', cat: '中陰' },
    { daysToAdd: 48, label: '四十九日忌', cat: '中陰' },
    { daysToAdd: 99, label: '百ヶ日忌', cat: '百ヶ日' },
  ];

  // Config for ninki (年回忌)
  const ninkiConfig: { addYears: number; label: string }[] = [
    { addYears: 1, label: '一周忌' },
    { addYears: 2, label: '三回忌' },
    { addYears: 6, label: '七回忌' },
    { addYears: 12, label: '十三回忌' },
    { addYears: 16, label: '十七回忌' },
    { addYears: 22, label: '二十三回忌' },
    { addYears: 26, label: '二十七回忌' },
    { addYears: 32, label: '三十三回忌' },
    { addYears: 49, label: '五十回忌' },
    { addYears: 99, label: '百回忌' },
  ];

  pastRecords.forEach((record) => {
    if (!record || !record.deathDate) return;
    const normalized = normalizeDateInput(record.deathDate);
    if (!normalized) return;
    const parts = normalized.split('/');
    if (parts.length !== 3) return;

    const deathY = parseInt(parts[0], 10);
    const deathM = parseInt(parts[1], 10);
    const deathD = parseInt(parts[2], 10);
    if (isNaN(deathY) || isNaN(deathM) || isNaN(deathD)) return;

    const hh = householdMap.get(record.householdId);

    // 1. 中陰 & 百ヶ日チェック
    chuinDays.forEach(({ daysToAdd, label, cat }) => {
      const d = new Date(deathY, deathM - 1, deathD);
      d.setDate(d.getDate() + daysToAdd);

      const targetUtc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
      if (targetUtc >= startUtc && targetUtc <= endUtc) {
        const daysUntil = Math.round((targetUtc - startUtc) / (24 * 60 * 60 * 1000));
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const dStr = String(d.getDate()).padStart(2, '0');
        const scheduledDate = `${d.getFullYear()}/${mStr}/${dStr}`;

        candidates.push({
          id: `${record.id}-${label}-${scheduledDate}`,
          record,
          household: hh,
          memorialType: label,
          category: cat,
          scheduledDate,
          deathDateNormalized: normalized,
          daysUntil,
          description: `命日: ${normalized} (${daysToAdd + 1}日目)`,
        });
      }
    });

    // 2. 年回忌チェック
    ninkiConfig.forEach(({ addYears, label }) => {
      const targetYear = deathY + addYears;
      let targetMonth = deathM - 1;
      let targetDay = deathD;

      // うるう年2月29日命日の平年での処理
      if (deathM === 2 && deathD === 29 && !isLeapYear(targetYear)) {
        targetDay = 28;
      }

      const targetUtc = Date.UTC(targetYear, targetMonth, targetDay);
      if (targetUtc >= startUtc && targetUtc <= endUtc) {
        const daysUntil = Math.round((targetUtc - startUtc) / (24 * 60 * 60 * 1000));
        const mStr = String(targetMonth + 1).padStart(2, '0');
        const dStr = String(targetDay).padStart(2, '0');
        const scheduledDate = `${targetYear}/${mStr}/${dStr}`;

        candidates.push({
          id: `${record.id}-${label}-${scheduledDate}`,
          record,
          household: hh,
          memorialType: label,
          category: '年回忌',
          scheduledDate,
          deathDateNormalized: normalized,
          daysUntil,
          description: `命日: ${normalized} (祥月命日・${label})`,
        });
      }
    });
  });

  // Sort by scheduledDate ascending (closest upcoming first)
  candidates.sort((a, b) => {
    const dComp = a.scheduledDate.localeCompare(b.scheduledDate);
    if (dComp !== 0) return dComp;
    return (a.record.dharmaName || '').localeCompare(b.record.dharmaName || '');
  });

  return candidates;
}

/**
 * 精霊の没年月日（命日）から、基準日（デフォルト: 本日）以降で「直近・一番先に到来する忌日・年忌」（1つ）を計算
 * 例: 四十九日、百ヶ日、一周忌、三回忌、七回忌、十三回忌...
 * 四十九日が既に過去であれば百ヶ日、百ヶ日も過去であれば一周忌、一周忌も過去であれば三回忌...と直近未来の忌日を返す
 */
export interface NextMemorialResult {
  memorialType: string; // "四十九日", "百ヶ日", "一周忌", "三回忌", etc.
  scheduledDate: string; // "YYYY/MM/DD"
  month: number;
  day: number;
  daysUntil: number;
  japaneseEra: string;
}

export function getNextUpcomingMemorialForSpirit(
  deathDateStr?: string,
  baseDateStr?: string
): NextMemorialResult | null {
  if (!deathDateStr) return null;
  const normalized = normalizeDateInput(deathDateStr);
  if (!normalized) return null;
  const parts = normalized.split('/');
  if (parts.length !== 3) return null;

  const deathY = parseInt(parts[0], 10);
  const deathM = parseInt(parts[1], 10);
  const deathD = parseInt(parts[2], 10);
  if (isNaN(deathY) || isNaN(deathM) || isNaN(deathD)) return null;

  // 基準日 (YYYY/MM/DD)
  let baseY: number;
  let baseM: number;
  let baseD: number;

  const normBase = baseDateStr ? normalizeDateInput(baseDateStr) : null;
  if (normBase) {
    const baseParts = normBase.split('/');
    baseY = parseInt(baseParts[0], 10);
    baseM = parseInt(baseParts[1], 10);
    baseD = parseInt(baseParts[2], 10);
  } else {
    const now = new Date();
    baseY = now.getFullYear();
    baseM = now.getMonth() + 1;
    baseD = now.getDate();
  }

  const startUtc = Date.UTC(baseY, baseM - 1, baseD);

  const allMilestones: { memorialType: string; scheduledDate: string; utcTime: number }[] = [];

  // 1. 中陰・百ヶ日
  // 初七日 (没日+6日), 二七日(没日+13日), 三七日(没日+20日), 四七日(没日+27日), 五七日(没日+34日), 六七日(没日+41日), 四十九日 (没日+48日), 百ヶ日 (没日+99日)
  const chuinList = [
    { daysToAdd: 6, label: '初七日' },
    { daysToAdd: 13, label: '二七日' },
    { daysToAdd: 20, label: '三七日' },
    { daysToAdd: 27, label: '四七日' },
    { daysToAdd: 34, label: '五七日' },
    { daysToAdd: 41, label: '六七日' },
    { daysToAdd: 48, label: '四十九日' },
    { daysToAdd: 99, label: '百ヶ日' },
  ];

  chuinList.forEach(({ daysToAdd, label }) => {
    const d = new Date(deathY, deathM - 1, deathD);
    d.setDate(d.getDate() + daysToAdd);
    const mStr = String(d.getMonth() + 1).padStart(2, '0');
    const dStr = String(d.getDate()).padStart(2, '0');
    const scheduledDate = `${d.getFullYear()}/${mStr}/${dStr}`;
    const utcTime = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    allMilestones.push({ memorialType: label, scheduledDate, utcTime });
  });

  // 2. 年回忌 (一周忌、三回忌、七回忌、十三回忌、十七回忌、二十三回忌、二十七回忌、三十三回忌、五十回忌、百回忌、二百回忌...)
  const ninkiConfig: { addYears: number; label: string }[] = [
    { addYears: 1, label: '一周忌' },
    { addYears: 2, label: '三回忌' },
    { addYears: 6, label: '七回忌' },
    { addYears: 12, label: '十三回忌' },
    { addYears: 16, label: '十七回忌' },
    { addYears: 22, label: '二十三回忌' },
    { addYears: 26, label: '二十七回忌' },
    { addYears: 32, label: '三十三回忌' },
    { addYears: 49, label: '五十回忌' },
    { addYears: 99, label: '百回忌' },
    { addYears: 199, label: '二百回忌' },
  ];

  for (let y = 300; y <= 2000; y += 100) {
    ninkiConfig.push({
      addYears: y - 1,
      label: `${toKanjiNumber(y)}回忌`,
    });
  }

  ninkiConfig.forEach(({ addYears, label }) => {
    const targetYear = deathY + addYears;
    let targetMonth = deathM - 1;
    let targetDay = deathD;

    if (deathM === 2 && deathD === 29 && !isLeapYear(targetYear)) {
      targetDay = 28;
    }

    const mStr = String(targetMonth + 1).padStart(2, '0');
    const dStr = String(targetDay).padStart(2, '0');
    const scheduledDate = `${targetYear}/${mStr}/${dStr}`;
    const utcTime = Date.UTC(targetYear, targetMonth, targetDay);
    allMilestones.push({ memorialType: label, scheduledDate, utcTime });
  });

  // Sort chronologically
  allMilestones.sort((a, b) => a.utcTime - b.utcTime);

  // Find first milestone where utcTime >= startUtc
  const upcoming = allMilestones.find((m) => m.utcTime >= startUtc);
  if (!upcoming) return null;

  const upParts = upcoming.scheduledDate.split('/');
  const upY = parseInt(upParts[0], 10);
  const upM = parseInt(upParts[1], 10);
  const upD = parseInt(upParts[2], 10);
  const daysUntil = Math.round((upcoming.utcTime - startUtc) / (24 * 60 * 60 * 1000));

  return {
    memorialType: upcoming.memorialType,
    scheduledDate: upcoming.scheduledDate,
    month: upM,
    day: upD,
    daysUntil,
    japaneseEra: getJapaneseEra(upY, upM, upD),
  };
}

/**
 * 精霊の命日と指定日（法要予定日）から、その指定日における回忌・法要種別を算出
 * 例: 2024/05/10 没で 2026/08/20 指定 -> "三回忌"
 *     2025/08/10 没で 2026/08/20 指定 -> "一周忌"
 *     2026/07/01 没で 2026/08/20 指定 -> "四十九日"
 */
export function getSpiritMemorialForDate(deathDateStr?: string, targetDateStr?: string): string {
  if (!deathDateStr) return '';
  const normDeath = normalizeDateInput(deathDateStr);
  const now = new Date();
  const defTarget = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  const normTarget = normalizeDateInput(targetDateStr || '') || defTarget;
  
  const dParts = normDeath.split('/');
  const tParts = normTarget.split('/');
  if (dParts.length !== 3 || tParts.length !== 3) return '';

  const dYear = parseInt(dParts[0], 10);
  const dMonth = parseInt(dParts[1], 10) - 1;
  const dDay = parseInt(dParts[2], 10);

  const tYear = parseInt(tParts[0], 10);
  const tMonth = parseInt(tParts[1], 10) - 1;
  const tDay = parseInt(tParts[2], 10);

  const dDate = new Date(dYear, dMonth, dDay);
  const tDate = new Date(tYear, tMonth, tDay);
  if (isNaN(dDate.getTime()) || isNaN(tDate.getTime())) return '';

  const diffYears = tYear - dYear;
  if (diffYears < 0) return '';

  // 当年（没年と同じ年）の場合
  if (diffYears === 0) {
    const diffTime = tDate.getTime() - dDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // 命日当日を1日目とする
    if (diffDays <= 7) return '初七日';
    if (diffDays <= 49) return '四十九日';
    if (diffDays <= 100) return '百ヶ日';
    return '';
  }

  // 年回忌マッピング（実際に存在する伝統的忌日・年回忌のみを返す。それ以外の年は空文字）
  if (diffYears === 1) return '一周忌';
  if (diffYears === 2) return '三回忌';
  if (diffYears === 6) return '七回忌';
  if (diffYears === 12) return '十三回忌';
  if (diffYears === 16) return '十七回忌';
  if (diffYears === 22) return '二十三回忌';
  if (diffYears === 26) return '二十七回忌';
  if (diffYears === 32) return '三十三回忌';
  if (diffYears === 49) return '五十回忌';
  if (diffYears === 99) return '百回忌';

  // 100年ごとの回忌 (200回忌, 300回忌〜)
  const kaikiNum = diffYears + 1;
  if (kaikiNum >= 100 && kaikiNum % 100 === 0) {
    return `${toKanjiNumber(kaikiNum)}回忌`;
  }

  // 該当する実際の忌日・年回忌がない場合は表示しない
  return '';
}

