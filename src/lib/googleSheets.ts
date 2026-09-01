import { 
  Household, 
  PastRecord, 
  MemorialService, 
  Transaction, 
  TempleInfo, 
  TempleProfile, 
  MasterOptions, 
  FamilyMember, 
  TempleTodo, 
  TodoCategory,
  TempleAnnualEvent,
  Priest,
  DeletedRecordEntry,
  BatchAccountingData
} from '../types';
import { INITIAL_MASTER_OPTIONS, EMPTY_MASTER_OPTIONS, INITIAL_TEMPLE_INFO } from '../data/initialData';
import { 
  getSavedNoticeTemplates, 
  saveNoticeTemplates, 
  getAllSavedNoticeTemplates,
  saveAllNoticeTemplates,
  NoticeTemplateItem,
  DEFAULT_HIGAN_TEMPLATE, 
  DEFAULT_NIIBON_TEMPLATE, 
  normalizeDateInput, 
  normalizeFurigana 
} from '../utils/memorialCalculator';
import { 
  mergeMasterOptionsWithData, 
  getTempleMasterOptions 
} from '../utils/masterOptionsUtils';
import { getAuditRowValues, normalizeAuditDate, normalizeAuditTime, getCurrentAuditFields } from '../utils/auditUtils';
import { sanitizeAppDataset } from '../utils/sanitizeDataUtils';
import { loadDeletedRecordsLog, MAX_DELETED_LOG_LENGTH } from '../utils/deletedRecordsLog';
import { 
  getSavedBatchAccountingData, 
  getSavedBatchAccountingConfig,
  saveBatchAccountingConfig,
  saveBatchAccountingData,
  convertBatchAccountingToRows, 
  convertBatchAccountingConfigToRows,
  parseBatchAccountingFromRows,
  parseBatchAccountingConfigFromRows,
  reconstructBatchAccountingData
} from '../utils/batchAccountingUtils';
import {
  getSavedDisasterMemorialEvents,
  saveDisasterMemorialEvents,
  convertDisasterEventsToRows,
  parseDisasterEventsFromRows
} from '../utils/disasterMemorialUtils';

export const SPREADSHEET_NAME = '寺院管理・檀家過去帳データ';

/**
 * Robust fetch wrapper with automatic retries for transient network failures,
 * rate limits (429), and Google API server errors (500, 502, 503, 504).
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries: number = 3,
  initialBackoffMs: number = 600
): Promise<Response> {
  let attempt = 0;
  let lastError: any = null;

  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, options);

      // Retry on 429 (Too Many Requests) or 5xx server errors
      if (
        (res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) &&
        attempt < maxRetries - 1
      ) {
        attempt++;
        const delay = initialBackoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return res;
    } catch (err: any) {
      lastError = err;
      attempt++;
      if (attempt < maxRetries) {
        const delay = initialBackoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  const isFetchError =
    lastError?.name === 'TypeError' ||
    lastError?.message?.includes('fetch') ||
    lastError?.message?.includes('NetworkError') ||
    lastError?.message?.includes('Failed to fetch');

  if (isFetchError) {
    const networkErr = new Error('インターネット通信またはGoogleサーバーへの接続に失敗しました。通信環境をご確認の上、再度お試しください。');
    (networkErr as any).isNetworkError = true;
    (networkErr as any).originalError = lastError;
    throw networkErr;
  }

  throw lastError || new Error('通信エラーが発生しました。');
}

export function handleGoogleApiError(res: Response, errJson: any, defaultMessage: string): never {
  const status = res.status;
  const rawMsg = errJson?.error?.message || res.statusText || '';
  if (
    status === 401 ||
    errJson?.error?.status === 'UNAUTHENTICATED' ||
    rawMsg.includes('invalid authentication credentials') ||
    rawMsg.includes('Invalid Credentials') ||
    rawMsg.includes('OAuth 2 access token')
  ) {
    const authErr = new Error('Google認証の有効期限が切れました。データ連携画面より再度ログインしてください。');
    (authErr as any).status = 401;
    (authErr as any).isAuthError = true;
    throw authErr;
  }
  if (status === 403) {
    const permErr = new Error(`Google スプレッドシートへのアクセス権限がありません (403)。アクセス権限をご確認ください。: ${rawMsg}`);
    (permErr as any).status = 403;
    throw permErr;
  }
  if (status === 404) {
    const notFoundErr = new Error(`指定されたGoogle スプレッドシートが見つかりませんでした (404)。`);
    (notFoundErr as any).status = 404;
    (notFoundErr as any).isNotFound = true;
    throw notFoundErr;
  }
  const genericErr = new Error(`${defaultMessage}: ${rawMsg || status}`);
  (genericErr as any).status = status;
  throw genericErr;
}

export function isNotFoundError(err: any): boolean {
  return Boolean(
    err?.status === 404 ||
    err?.isNotFound === true ||
    err?.message?.includes('404') ||
    err?.message?.includes('見つかりませんでした')
  );
}

const BASE_REQUIRED_SHEETS = [
  '寺院一覧（本寺・兼務）',
  '檀家名簿',
  '家族構成',
  '過去帳',
  '法事予約',
  '寺院ToDo',
  '出納・会計',
  '案内文テンプレート',
  '登録僧侶一覧',
  '一括会計設定',
  '一括会計受付',
  '戦没・災害物故者命日設定',
  '操作・削除履歴'
];

// Helper to search for an existing spreadsheet or create one
export async function findOrCreateSpreadsheet(
  accessToken: string,
  forceCreateNew: boolean = false
): Promise<{ id: string; url: string; isExisting: boolean }> {
  if (!forceCreateNew) {
    // 1. Search in Google Drive for existing file (Newest first, full drive support)
    try {
      const escapedName = SPREADSHEET_NAME.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const driveQuery = `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        driveQuery
      )}&orderBy=modifiedTime desc&pageSize=30&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,webViewLink,createdTime,modifiedTime,size,description)`;

      const response = await fetchWithRetry(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.files && data.files.length > 0) {
          // If multiple files exist (e.g. created previously), inspect them and pick the primary one with highest data quality / sheets
          let bestCandidate: { id: string; url: string; score: number } | null = null;

          for (const file of data.files) {
            try {
              const testMetaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${file.id}?fields=spreadsheetId,properties.title,sheets.properties(title,gridProperties(rowCount,columnCount))`;
              const testRes = await fetchWithRetry(testMetaUrl, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (testRes.ok) {
                const sheetMeta = await testRes.json();
                const sheetTitles: string[] = (sheetMeta.sheets || []).map((s: any) => s.properties?.title || '');
                
                // Calculate match score: how many core app sheets exist in this file
                const coreSheetMatches = BASE_REQUIRED_SHEETS.filter((s) => sheetTitles.includes(s)).length;
                let estimatedTotalRows = 0;
                (sheetMeta.sheets || []).forEach((s: any) => {
                  const rows = s.properties?.gridProperties?.rowCount || 0;
                  if (rows > 1) estimatedTotalRows += rows;
                });

                // Weight: core sheets match heavily, then estimated rows, then order in search (modifiedTime)
                const score = coreSheetMatches * 10000 + Math.min(estimatedTotalRows, 50000);

                if (!bestCandidate || score > bestCandidate.score) {
                  bestCandidate = {
                    id: file.id,
                    url: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}`,
                    score,
                  };
                }
              }
            } catch (checkErr) {
              console.warn(`File ${file.id} check failed, skipping:`, checkErr);
            }
          }

          if (bestCandidate) {
            await ensureAllSheetsExist(accessToken, bestCandidate.id);
            return {
              id: bestCandidate.id,
              url: bestCandidate.url,
              isExisting: true,
            };
          }
        }
      } else {
        const errJson = await response.json().catch(() => ({}));
        console.warn('Google Drive search response not ok:', response.status, errJson);
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Google Driveの検索権限エラー (${response.status})。再ログインをお試しください。`);
        }
      }
    } catch (driveErr: any) {
      console.warn('Google Drive search failed:', driveErr);
      if (driveErr?.message?.includes('再ログイン') || driveErr?.message?.includes('権限')) {
        throw driveErr;
      }
    }
  }

  // 2. If not found or forced, create a new spreadsheet with all required sheet tabs
  return await createNewSpreadsheet(accessToken, SPREADSHEET_NAME);
}

// Delete a Google Drive file permanently or move to trash
export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`;
    const res = await fetchWithRetry(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 404) {
      // If direct DELETE is forbidden by permissions, fallback to trashing the file
      const trashUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`;
      await fetchWithRetry(trashUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trashed: true }),
      }).catch((e) => console.warn('Trash file error:', e));
    }
  } catch (err) {
    console.warn(`Failed to delete drive file ${fileId}:`, err);
  }
}

// Search and delete all existing spreadsheets with the specified name in Google Drive
export async function deleteAllExistingSpreadsheetsByName(
  accessToken: string,
  fileName: string = SPREADSHEET_NAME,
  explicitFileId?: string
): Promise<void> {
  try {
    if (explicitFileId) {
      await deleteDriveFile(accessToken, explicitFileId);
    }
    const escapedName = fileName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const driveQuery = `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      driveQuery
    )}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`;

    const response = await fetchWithRetry(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.files && Array.isArray(data.files)) {
        for (const file of data.files) {
          if (file.id && file.id !== explicitFileId) {
            await deleteDriveFile(accessToken, file.id);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error deleting existing spreadsheets by name:', err);
  }
}

// Create a new Google Spreadsheet with all required sheet tabs from scratch
export async function createNewSpreadsheet(
  accessToken: string,
  title: string = SPREADSHEET_NAME
): Promise<{ id: string; url: string; isExisting: boolean }> {
  const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  const createPayload = {
    properties: { 
      title,
      locale: 'ja_JP',
      autoRecalc: 'ON_CHANGE'
    },
    sheets: BASE_REQUIRED_SHEETS.map((t) => ({ properties: { title: t } })),
  };

  const createRes = await fetchWithRetry(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createPayload),
  });

  if (!createRes.ok) {
    const errJson = await createRes.json().catch(() => ({}));
    throw new Error(errJson?.error?.message || 'Google スプレッドシートの新規作成に失敗しました。');
  }

  const newSheet = await createRes.json();
  return {
    id: newSheet.spreadsheetId,
    url: newSheet.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${newSheet.spreadsheetId}`,
    isExisting: false,
  };
}

// Helper to parse spreadsheet ID from URL or raw ID
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

export interface SheetPermission {
  id: string;
  displayName?: string;
  emailAddress?: string;
  role: 'owner' | 'writer' | 'reader' | 'commenter' | string;
  type: 'user' | 'group' | 'domain' | 'anyone' | string;
  photoLink?: string;
  deleted?: boolean;
}

// Fetch all permissions for the specified spreadsheet
export async function getSpreadsheetPermissions(accessToken: string, fileId: string): Promise<SheetPermission[]> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(id,displayName,emailAddress,role,type,photoLink,deleted)&supportsAllDrives=true`;
  const response = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || '共有ユーザー情報の取得に失敗しました。');
  }

  const data = await response.json();
  return (data.permissions || []).filter((p: SheetPermission) => !p.deleted);
}

// Share spreadsheet with another Google user by email
export async function shareSpreadsheetWithUser(
  accessToken: string,
  fileId: string,
  emailAddress: string,
  role: 'writer' | 'reader' = 'writer',
  sendNotificationEmail: boolean = true
): Promise<SheetPermission> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=${sendNotificationEmail}&supportsAllDrives=true`;
  const body = {
    role,
    type: 'user',
    emailAddress: emailAddress.trim(),
  };

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `ユーザー(${emailAddress})への共有設定に失敗しました。`);
  }

  return await response.json();
}

// Remove a user/entity permission from the spreadsheet
export async function removeSpreadsheetPermission(
  accessToken: string,
  fileId: string,
  permissionId: string
): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}?supportsAllDrives=true`;
  const response = await fetchWithRetry(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || '共有ユーザーの解除に失敗しました。');
  }
}

// Update permission role (e.g. reader -> writer)
export async function updateSpreadsheetPermissionRole(
  accessToken: string,
  fileId: string,
  permissionId: string,
  newRole: 'writer' | 'reader'
): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}?supportsAllDrives=true`;
  const response = await fetchWithRetry(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: newRole }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || '権限の更新に失敗しました。');
  }
}

// Enable or disable public link sharing ("anyone" permission)
export async function setSpreadsheetLinkSharing(
  accessToken: string,
  fileId: string,
  enable: boolean,
  role: 'writer' | 'reader' = 'reader',
  existingAnyonePermissionId?: string
): Promise<void> {
  if (enable) {
    if (existingAnyonePermissionId) {
      await updateSpreadsheetPermissionRole(accessToken, fileId, existingAnyonePermissionId, role);
    } else {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`;
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role,
          type: 'anyone',
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'リンク共有の設定に失敗しました。');
      }
    }
  } else if (existingAnyonePermissionId) {
    await removeSpreadsheetPermission(accessToken, fileId, existingAnyonePermissionId);
  }
}

// Validate and connect to an existing / shared spreadsheet
export async function validateAndConnectSpreadsheet(
  accessToken: string,
  spreadsheetIdOrUrl: string
): Promise<{ id: string; url: string; title: string; isExisting: boolean }> {
  const id = extractSpreadsheetId(spreadsheetIdOrUrl);
  if (!id) {
    throw new Error('スプレッドシートのIDまたはURLを入力してください。');
  }

  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId,spreadsheetUrl,properties.title`;
  const res = await fetchWithRetry(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData.error?.message ||
      '指定されたスプレッドシートにアクセスできませんでした。Googleアカウントにアクセス権限（閲覧・編集）が付与されているか確認してください。'
    );
  }

  const data = await res.json();
  await ensureAllSheetsExist(accessToken, id);

  return {
    id: data.spreadsheetId,
    url: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`,
    title: data.properties?.title || SPREADSHEET_NAME,
    isExisting: true,
  };
}

// Ensure all required sheet tabs exist in an existing spreadsheet with sufficient row and column capacity
export async function ensureAllSheetsExist(
  accessToken: string, 
  spreadsheetId: string, 
  temples?: TempleProfile[],
  exportOptions?: { targetTempleId?: string | 'ALL'; templeMasterOptionsMap?: Record<string, MasterOptions> }
): Promise<void> {
  try {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`;
    const res = await fetchWithRetry(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return;

    const data = await res.json();
    const existingSheets: { sheetId: number; title: string; rowCount: number; columnCount: number }[] = (data.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId,
      title: s.properties?.title || '',
      rowCount: s.properties?.gridProperties?.rowCount || 1000,
      columnCount: s.properties?.gridProperties?.columnCount || 26,
    }));
    const existingTitles: string[] = existingSheets.map((s) => s.title);

    const isIndividualExport = Boolean(exportOptions?.targetTempleId && exportOptions.targetTempleId !== 'ALL');
    const requiredTitles: string[] = isIndividualExport
      ? [
          '寺院情報',
          '檀家名簿',
          '家族構成',
          '過去帳',
          '法事予約',
          '寺院ToDo',
          '出納・会計',
          '案内文テンプレート',
          '一括会計受付',
          '操作・削除履歴'
        ]
      : [
          ...BASE_REQUIRED_SHEETS,
        ];

    // Add per-temple master sheets for each active temple
    if (temples && temples.length > 0) {
      temples.forEach((t) => {
        if (isIndividualExport && t.id !== exportOptions?.targetTempleId) return;
        const sheetTitle = `マスタ_${t.shortName || t.name}`;
        if (!requiredTitles.includes(sheetTitle)) {
          requiredTitles.push(sheetTitle);
        }
      });
    }

    const missingTitles = requiredTitles.filter((t) => {
      // Check exact title or recognized aliases (e.g. 法事・予約一覧 for 法事予約, 寺院タスク・ToDo for 寺院ToDo)
      if (existingTitles.includes(t)) return false;
      if (t === '法事予約' && existingTitles.includes('法事・予約一覧')) return false;
      if (t === '寺院ToDo' && existingTitles.includes('寺院タスク・ToDo')) return false;
      return true;
    });

    if (missingTitles.length > 0) {
      const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
      // Create new sheets with generous default dimensions (10000 rows, 50 columns) so large datasets never exceed bounds
      const requests = missingTitles.map((title) => ({
        addSheet: {
          properties: {
            title,
            gridProperties: {
              rowCount: 10000,
              columnCount: 50,
            },
          },
        },
      }));

      await fetchWithRetry(batchUpdateUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      });
    }
  } catch (err) {
    console.warn('Failed to ensure sheet tabs exist:', err);
  }
}

// Dynamically expand sheet grid row/column capacity if dataset rows/columns exceed current Google Sheets grid limits
export async function ensureSheetGridCapacities(
  accessToken: string,
  spreadsheetId: string,
  sheetCapacities: { sheetName: string; requiredRows: number; requiredCols: number }[]
): Promise<void> {
  if (sheetCapacities.length === 0) return;
  try {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`;
    const metaRes = await fetchWithRetry(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) return;

    const metaData = await metaRes.json();
    const sheetsList: { sheetId: number; title: string; rowCount: number; columnCount: number }[] = (metaData.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId,
      title: s.properties?.title || '',
      rowCount: s.properties?.gridProperties?.rowCount || 1000,
      columnCount: s.properties?.gridProperties?.columnCount || 26,
    }));

    const updateRequests: any[] = [];

    for (const cap of sheetCapacities) {
      const target = sheetsList.find(
        (s) =>
          s.title === cap.sheetName ||
          s.title === `'${cap.sheetName}'` ||
          (cap.sheetName === '法事予約' && s.title === '法事・予約一覧') ||
          (cap.sheetName === '寺院ToDo' && s.title === '寺院タスク・ToDo') ||
          (cap.sheetName === 'マスタ設定（総合）' && s.title === 'マスタ設定')
      );

      if (!target) continue;

      const neededRows = Math.max(cap.requiredRows + 200, 1000);
      const neededCols = Math.max(cap.requiredCols + 10, 30);

      const needsRowExpansion = target.rowCount < neededRows;
      const needsColExpansion = target.columnCount < neededCols;

      if (needsRowExpansion || needsColExpansion) {
        updateRequests.push({
          updateSheetProperties: {
            properties: {
              sheetId: target.sheetId,
              gridProperties: {
                rowCount: Math.max(target.rowCount, neededRows),
                columnCount: Math.max(target.columnCount, neededCols),
              },
            },
            fields: 'gridProperties(rowCount,columnCount)',
          },
        });
      }
    }

    if (updateRequests.length > 0) {
      const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
      await fetchWithRetry(batchUpdateUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests: updateRequests }),
      });
    }
  } catch (err) {
    console.warn('Auto grid expansion warning:', err);
  }
}

// Completely clears all cell data from all sheets in the Google Spreadsheet.
export async function clearAllSpreadsheetData(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  try {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`;
    const metaRes = await fetchWithRetry(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metaRes.ok) {
      const errJson = await metaRes.json().catch(() => ({}));
      handleGoogleApiError(metaRes, errJson, 'スプレッドシートのメタデータ取得に失敗しました');
    }

    const metaData = await metaRes.json();
    const existingSheets: { sheetId: number; title: string }[] = (metaData.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId,
      title: s.properties?.title || '',
    }));

    if (existingSheets.length === 0) return;

    // Create clear ranges for all existing sheets
    const clearRanges = existingSheets
      .filter((s) => Boolean(s.title))
      .map((s) => `'${s.title.replace(/'/g, "''")}'`);

    if (clearRanges.length === 0) return;

    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`;
    const clearRes = await fetchWithRetry(clearUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ranges: clearRanges }),
    });

    if (!clearRes.ok) {
      console.warn('batchClear returned non-ok, falling back to per-sheet clear');
      for (const s of existingSheets) {
        if (!s.title) continue;
        const singleClearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(s.title)}':clear`;
        await fetchWithRetry(singleClearUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }).catch((e) => console.warn(`Failed to clear sheet ${s.title}:`, e));
      }
    }
  } catch (err) {
    console.error('Error in clearAllSpreadsheetData:', err);
    throw err;
  }
}

// Export all app data to Google Sheets (matching Excel specification exactly)
export async function exportToSheets(
  accessToken: string,
  spreadsheetId: string,
  templeInfo: TempleInfo,
  households: Household[],
  pastRecords: PastRecord[],
  memorialServices: MemorialService[],
  transactions: Transaction[],
  masterOptions?: MasterOptions,
  noticeTemplates?: { higan: string; niibon: string },
  templeTodos?: TempleTodo[],
  temples?: TempleProfile[],
  exportOptions?: {
    targetTempleId?: string | 'ALL';
    templeMasterOptionsMap?: Record<string, MasterOptions>;
    priests?: Priest[];
    deletedRecords?: DeletedRecordEntry[];
    batchAccountingData?: BatchAccountingData;
    targetTablesOnly?: string[];
  }
): Promise<void> {
  await ensureAllSheetsExist(accessToken, spreadsheetId, temples, exportOptions);

  const targetTablesFilter = exportOptions?.targetTablesOnly && exportOptions.targetTablesOnly.length > 0
    ? new Set(exportOptions.targetTablesOnly.map((t) => t.trim()))
    : null;

  const shouldIncludeSheet = (sheetName: string): boolean => {
    if (!targetTablesFilter) return true;
    if (targetTablesFilter.has(sheetName)) return true;
    // Also match master sheets if 'マスタ設定' or 'マスタ' is specified
    if (sheetName.startsWith('マスタ_') && (targetTablesFilter.has('マスタ') || targetTablesFilter.has('マスタ設定'))) {
      return true;
    }
    // Also match temple list / temple info aliases
    if ((sheetName === '寺院一覧（本寺・兼務）' || sheetName === '寺院情報') &&
        (targetTablesFilter.has('寺院情報') || targetTablesFilter.has('寺院一覧') || targetTablesFilter.has('寺院設定'))) {
      return true;
    }
    // Also match notice templates aliases
    if (sheetName === '案内文テンプレート' &&
        (targetTablesFilter.has('案内文テンプレート') || targetTablesFilter.has('案内文') || targetTablesFilter.has('テンプレート') || targetTablesFilter.has('案内文設定'))) {
      return true;
    }
    return false;
  };

  const currentMaster = masterOptions || INITIAL_MASTER_OPTIONS;
  const currentTemplates = noticeTemplates || getSavedNoticeTemplates();

  const isIndividualExport = Boolean(exportOptions?.targetTempleId && exportOptions.targetTempleId !== 'ALL');
  const targetTempleId = exportOptions?.targetTempleId;

  const allTemples: TempleProfile[] = temples && temples.length > 0
    ? temples
    : [{ ...templeInfo, id: templeInfo.id || 'temple-main', isMain: true }];

  const currentSingleTemple = isIndividualExport
    ? allTemples.find((t) => (t.id || 'temple-main') === targetTempleId) || allTemples[0]
    : allTemples[0];

  const templeMap = new Map<string, TempleProfile>();
  allTemples.forEach((t) => {
    if (t.id) templeMap.set(t.id, t);
  });

  const getTempleLabel = (templeId?: string): string => {
    const id = templeId || allTemples[0]?.id || 'temple-main';
    const found = templeMap.get(id);
    if (!found) {
      const foundByName = allTemples.find((t) => 
        t.id === id || 
        t.name === id || 
        (t.mountainName && `${t.mountainName} ${t.name}` === id) ||
        (t.name && id.includes(t.name))
      );
      if (foundByName) {
        return `${foundByName.mountainName ? foundByName.mountainName + ' ' : ''}${foundByName.name}（${foundByName.isMain ? '本寺' : '兼務'}）`;
      }
      return allTemples[0]?.name || templeInfo.name || '本寺';
    }
    return `${found.mountainName ? found.mountainName + ' ' : ''}${found.name}（${found.isMain ? '本寺' : '兼務'}）`;
  };

  const getTempleId = (templeId?: string): string => {
    if (!templeId) {
      const mainT = allTemples.find((t) => t.isMain);
      return mainT?.id || allTemples[0]?.id || 'temple-main';
    }
    const cleanId = String(templeId).trim();
    if (templeMap.has(cleanId)) return cleanId;
    
    const found = allTemples.find((t) => 
      t.id === cleanId ||
      t.name === cleanId ||
      (t.mountainName && `${t.mountainName} ${t.name}` === cleanId) ||
      (t.name && cleanId.includes(t.name)) ||
      (t.mountainName && cleanId.includes(t.mountainName))
    );
    if (found && found.id) return found.id;
    return cleanId;
  };

  // Filter datasets if individual temple export is specified
  const filteredHouseholds = isIndividualExport
    ? households.filter((h) => (h.templeId || 'temple-main') === targetTempleId)
    : households;

  const filteredPastRecords = isIndividualExport
    ? pastRecords.filter((r) => {
        const hh = households.find((h) => h.id === r.householdId);
        const effectiveId = r.templeId || hh?.templeId || 'temple-main';
        return effectiveId === targetTempleId;
      })
    : pastRecords;

  const filteredMemorialServices = isIndividualExport
    ? (memorialServices || []).filter((s) => (s.templeId || 'temple-main') === targetTempleId)
    : (memorialServices || []);

  const filteredTodos = isIndividualExport
    ? (templeTodos || []).filter((t) => (t.templeId || 'temple-main') === targetTempleId)
    : (templeTodos || []);

  const filteredTransactions = isIndividualExport
    ? transactions.filter((t) => (t.templeId || 'temple-main') === targetTempleId)
    : transactions;

  // 1. Temple Profiles List (寺院一覧（本寺・兼務） / 寺院情報)
  const templeHeaders = [
    '寺院ID',
    '寺院区分',
    '寺院名',
    '山号',
    '宗派',
    '住職名',
    '郵便番号',
    '住所',
    '電話番号',
    'FAX番号',
    'ホームページ',
    '銀行振込口座',
    'お盆時期',
    '会計処理方法',
    '会計年度開始月',
    '会計年度開始日',
    '会計年度終了月',
    '会計年度終了日',
    '塔婆申込１',
    '塔婆申込２',
    '塔婆申込３',
    '集金項目１',
    '集金項目１勘定科目',
    '集金項目１基準金額',
    '集金項目２',
    '集金項目２勘定科目',
    '集金項目２基準金額',
    '集金項目３',
    '集金項目３勘定科目',
    '集金項目３基準金額',
    '年間行事特記',
    'テーマカラー',
    '更新日時',
    '作成日時'
  ];

  const exportTemplesList = isIndividualExport ? [currentSingleTemple] : allTemples;
  const templeRows = exportTemplesList.map((t) => [
    t.id || 'temple-main',
    t.isMain ? '本寺（自寺）' : '兼務寺院（末寺）',
    t.name || '',
    t.mountainName || '',
    t.sect || '',
    t.chiefPriest || '',
    t.postalCode || '',
    t.address || '',
    t.phone || '',
    t.fax || '',
    t.website || '',
    t.bankInfo || '',
    t.bonSeason || '8月盆',
    t.accountingMode === 'combined' ? '全寺院合算（本寺扱い）' : '各寺院個別',
    t.fiscalYearStartMonth ?? 4,
    t.fiscalYearStartDay ?? 1,
    t.fiscalYearEndMonth ?? 3,
    t.fiscalYearEndDay ?? 31,
    t.tobaType1 !== undefined ? t.tobaType1 : '施餓鬼塔婆',
    t.tobaType2 || '',
    t.tobaType3 || '',
    t.feeType1 || '',
    t.feeType1Category || '',
    t.feeType1DefaultAmount !== undefined ? t.feeType1DefaultAmount : '',
    t.feeType2 || '',
    t.feeType2Category || '',
    t.feeType2DefaultAmount !== undefined ? t.feeType2DefaultAmount : '',
    t.feeType3 || '',
    t.feeType3Category || '',
    t.feeType3DefaultAmount !== undefined ? t.feeType3DefaultAmount : '',
    t.annualEventsNotes || '',
    t.color || '#D4AF37',
    t.updatedAt || t.updatedDate || '',
    t.createdAt || t.createdDate || ''
  ]);

  // 2. Temple Basic Info (寺院基本情報)
  const baseT = isIndividualExport ? currentSingleTemple : templeInfo;
  const templeInfoRows = [
    ['項目', '設定値'],
    ['対象寺院', isIndividualExport ? `${baseT.name}（単一寺院エクスポート）` : '全寺院一括エクスポート'],
    ['寺院名', baseT.name || ''],
    ['宗派', baseT.sect || ''],
    ['山号', baseT.mountainName || ''],
    ['住職名', baseT.chiefPriest || ''],
    ['郵便番号', baseT.postalCode || ''],
    ['住所', baseT.address || ''],
    ['電話番号', baseT.phone || ''],
    ['FAX番号', baseT.fax || ''],
    ['ホームページ', baseT.website || ''],
    ['銀行振込口座', baseT.bankInfo || ''],
    ['お盆時期', baseT.bonSeason || '8月盆'],
    ['会計処理方法', baseT.accountingMode === 'combined' ? '全寺院合算（本寺扱い）' : '各寺院個別'],
    ['会計年度開始月', String(baseT.fiscalYearStartMonth ?? 4)],
    ['会計年度開始日', String(baseT.fiscalYearStartDay ?? 1)],
    ['会計年度終了月', String(baseT.fiscalYearEndMonth ?? 3)],
    ['会計年度終了日', String(baseT.fiscalYearEndDay ?? 31)],
    ['塔婆申込１', baseT.tobaType1 !== undefined ? baseT.tobaType1 : '施餓鬼塔婆'],
    ['塔婆申込２', baseT.tobaType2 || ''],
    ['塔婆申込３', baseT.tobaType3 || ''],
    ['集金項目１', baseT.feeType1 || ''],
    ['集金項目１勘定科目', baseT.feeType1Category || ''],
    ['集金項目１基準金額', baseT.feeType1DefaultAmount !== undefined ? String(baseT.feeType1DefaultAmount) : ''],
    ['集金項目２', baseT.feeType2 || ''],
    ['集金項目２勘定科目', baseT.feeType2Category || ''],
    ['集金項目２基準金額', baseT.feeType2DefaultAmount !== undefined ? String(baseT.feeType2DefaultAmount) : ''],
    ['集金項目３', baseT.feeType3 || ''],
    ['集金項目３勘定科目', baseT.feeType3Category || ''],
    ['集金項目３基準金額', baseT.feeType3DefaultAmount !== undefined ? String(baseT.feeType3DefaultAmount) : ''],
    ['更新日時', baseT.updatedAt || (baseT.updatedDate ? `${baseT.updatedDate} ${baseT.updatedTime || ''}`.trim() : new Date().toISOString())],
    ['修正日', baseT.updatedDate || ''],
    ['修正時間', baseT.updatedTime || ''],
    ['出力寺院数', String(exportTemplesList.length)],
    ['最終出力日時', new Date().toLocaleString('ja-JP')]
  ];

  // 3. Household Sheet Rows (檀家名簿) - Unified with Excel
  const householdHeaders = [
    'ID',
    '所属寺院',
    '世帯主名',
    'フリガナ',
    '郵便番号',
    '住所',
    '電話番号',
    '携帯番号',
    'メール',
    '区分１',
    '区分２',
    '総代・世話人',
    '墓地番号',
    '塔婆申込１',
    '塔婆申込１為書き',
    '塔婆申込２',
    '塔婆申込２為書き',
    '塔婆申込３',
    '塔婆申込３為書き',
    '集金１金額',
    '集金２金額',
    '集金３金額',
    '棚経・月参り対象',
    '棚経訪問日',
    '棚経時間帯',
    '棚経担当僧侶',
    '棚経巡回順序',
    '棚経伺い先住所',
    '棚経訪問特記',
    'メモ',
    '作成日',
    '作成時間',
    '修正日',
    '修正時間',
    '所属寺院ID',
    '登録日時'
  ];

  const householdRows = filteredHouseholds.map((h) => {
    const [cDate, cTime, uDate, uTime] = getAuditRowValues(h);
    const toba1Applied = h.toba1Applied !== undefined ? h.toba1Applied : h.isSegakiToba;
    const toba1Tamegaki = h.toba1Tamegaki !== undefined ? h.toba1Tamegaki : (h.segakiTamegaki || '');
    return [
      h.id,
      getTempleLabel(h.templeId),
      h.familyHead || '',
      h.furigana || '',
      h.postalCode || '',
      h.address || '',
      h.phone || '',
      h.mobile || '',
      h.email || '',
      h.householdType || '',
      h.status || '',
      h.district || '',
      h.tombNumber || '',
      toba1Applied ? '申込済' : '未申込',
      toba1Tamegaki,
      h.toba2Applied ? '申込済' : '未申込',
      h.toba2Tamegaki || '',
      h.toba3Applied ? '申込済' : '未申込',
      h.toba3Tamegaki || '',
      h.fee1Amount !== undefined && h.fee1Amount !== null ? h.fee1Amount : (h.fee1 !== undefined && h.fee1 !== null ? h.fee1 : ''),
      h.fee2Amount !== undefined && h.fee2Amount !== null ? h.fee2Amount : (h.fee2 !== undefined && h.fee2 !== null ? h.fee2 : ''),
      h.fee3Amount !== undefined && h.fee3Amount !== null ? h.fee3Amount : (h.fee3 !== undefined && h.fee3 !== null ? h.fee3 : ''),
      h.tanagyoMonthlyVisit ? '対象' : '未対象',
      h.tanagyoDate || '',
      h.tanagyoTimeSlot || '',
      h.tanagyoPriestName || '',
      h.tanagyoOrder ?? '',
      h.tanagyoAddress || '',
      h.tanagyoNotes || '',
      h.notes || '',
      cDate,
      cTime,
      uDate,
      uTime,
      getTempleId(h.templeId),
      h.createdAt || cDate
    ];
  });

  // 4. Family Member Sheet Rows (家族構成) - Unified with Excel
  const familyHeaders = [
    '家族ID',
    '所属寺院',
    '世帯ID (檀家ID)',
    '氏名',
    'フリガナ',
    '続柄',
    '電話番号',
    '個別住所',
    '施主指定',
    '塔婆申込１',
    '塔婆申込１為書き',
    '塔婆申込２',
    '塔婆申込２為書き',
    '塔婆申込３',
    '塔婆申込３為書き',
    '備考',
    '作成日',
    '作成時間',
    '修正日',
    '修正時間',
    '所属寺院ID'
  ];

  const familyRows: (string | number)[][] = [];
  filteredHouseholds.forEach((h) => {
    (h.familyMembers || []).forEach((fm, idx) => {
      const [cDate, cTime, uDate, uTime] = getAuditRowValues(fm);
      const toba1Applied = fm.toba1Applied !== undefined ? fm.toba1Applied : fm.isSegakiToba;
      const toba1Tamegaki = fm.toba1Tamegaki !== undefined ? fm.toba1Tamegaki : (fm.segakiTamegaki || '');
      familyRows.push([
        fm.id || `FM-${h.id}-${idx + 1}`,
        getTempleLabel(h.templeId),
        fm.householdId || h.id,
        fm.name || '',
        fm.furigana || '',
        fm.relationship || '',
        fm.phone || '',
        fm.address || '',
        (fm.isChiefMourner || fm.isSponsor) ? '施主' : '',
        toba1Applied ? '申込済' : '未申込',
        toba1Tamegaki,
        fm.toba2Applied ? '申込済' : '未申込',
        fm.toba2Tamegaki || '',
        fm.toba3Applied ? '申込済' : '未申込',
        fm.toba3Tamegaki || '',
        fm.notes || '',
        cDate,
        cTime,
        uDate,
        uTime,
        getTempleId(h.templeId)
      ]);
    });
  });

  // 5. Past Records Sheet Rows (過去帳) - Unified with Excel
  const pastRecordHeaders = [
    'ID',
    '所属寺院',
    '檀家ID (世帯ID)',
    '戒名・法名',
    '俗名 (故人名)',
    'フリガナ',
    '命日 (没年月日)',
    '享年 (行年)',
    '続柄',
    '施主名 (現世帯主等)',
    '墓地番号',
    '新盆区分',
    '備考・行状',
    '作成日',
    '作成時間',
    '修正日',
    '修正時間',
    '所属寺院ID'
  ];

  const pastRows = filteredPastRecords.map((r) => {
    const hh = households.find((h) => h.id === r.householdId);
    const effectiveTempleId = r.templeId || hh?.templeId;
    const [cDate, cTime, uDate, uTime] = getAuditRowValues(r);
    return [
      r.id,
      getTempleLabel(effectiveTempleId),
      r.householdId || '',
      r.dharmaName || '',
      r.secularName || r.deceasedName || '',
      r.furigana || '',
      r.deathDate || '',
      r.ageAtDeath !== undefined && r.ageAtDeath !== null ? r.ageAtDeath : (r.age !== undefined && r.age !== null ? r.age : ''),
      r.relationship || '',
      r.householdHeadName || r.chiefMourner || '',
      r.burialLocation || r.tombNumber || '',
      r.niibon || '',
      r.notes || '',
      cDate,
      cTime,
      uDate,
      uTime,
      getTempleId(effectiveTempleId)
    ];
  });

  // 6. Memorial Services Sheet Rows (法事予約) - Unified with Excel
  const memorialServiceHeaders = [
    '予約ID',
    '所属寺院',
    '予定日',
    '開始時刻',
    '終了時刻',
    '種別・回忌',
    '施主名',
    '戒名・法名',
    '俗名 (故人名)',
    '会場',
    '訪問先住所',
    '参列予定人数',
    '布施金額',
    '塔婆本数',
    '塔婆種別',
    '塔婆料',
    '塔婆志主',
    '進捗状況',
    '受付状況',
    '会計記帳状況',
    '世帯ID',
    '過去帳ID',
    '出納伝票ID',
    '備考・特記',
    '作成日',
    '作成時間',
    '修正日',
    '修正時間',
    '所属寺院ID'
  ];

  const memorialRows = filteredMemorialServices.map((s) => {
    const [cDate, cTime, uDate, uTime] = getAuditRowValues(s);
    return [
      s.id,
      getTempleLabel(s.templeId),
      s.scheduledDate || '',
      s.scheduledTime || '',
      s.endTime || '',
      s.memorialType || '',
      s.chiefMourner || '',
      s.dharmaName || '',
      s.deceasedName || '',
      s.venue || '',
      s.address || '',
      s.attendeeCount || 0,
      s.offeringAmount || 0,
      s.tobaCount || 0,
      s.tobaType || '',
      s.tobaFee || 0,
      (s.tobaSponsors || []).filter(Boolean).join('、'),
      s.status || '未入金',
      s.receptionCheckedIn ? 'チェックイン済' : '未受付',
      s.accountingRecorded ? '記帳済' : '未記帳',
      s.householdId || '',
      s.deceasedId || '',
      s.transactionId || '',
      s.notes || '',
      cDate,
      cTime,
      uDate,
      uTime,
      getTempleId(s.templeId)
    ];
  });

  // 7. Temple Todos Sheet Rows (寺院ToDo) - Unified with Excel
  const todoHeaders = [
    'ToDo-ID',
    '所属寺院',
    '期日',
    '予定時刻',
    'タスク・行事名',
    '区分カテゴリ',
    '重要度',
    '完了状況',
    '関連施主名',
    '世帯ID',
    '法事予約ID',
    '備考メモ',
    '作成日',
    '作成時間',
    '修正日',
    '修正時間',
    '所属寺院ID',
    '作成日時'
  ];

  const todoRows = filteredTodos.map((t) => {
    const [cDate, cTime, uDate, uTime] = getAuditRowValues(t);
    return [
      t.id,
      getTempleLabel(t.templeId),
      t.dueDate || '',
      t.dueTime || '',
      t.title || '',
      t.category || '法事',
      t.priority === 'urgent' ? '至急' : t.priority === 'high' ? '高' : t.priority === 'medium' ? '中' : '低',
      t.completed ? '完了' : '未完了',
      t.contactName || t.householdHeadName || '',
      t.householdId || '',
      t.serviceId || t.relatedServiceId || '',
      t.notes || '',
      cDate,
      cTime,
      uDate,
      uTime,
      getTempleId(t.templeId),
      t.createdAt || cDate
    ];
  });

  // 8. Transactions Sheet Rows (出納・会計) - Unified with Excel
  const transactionHeaders = [
    '伝票ID',
    '所属寺院',
    '日付',
    '収支区分',
    '勘定科目',
    '金額',
    '施主・支払者名',
    '支払方法',
    '領収書番号',
    '世帯ID',
    '備考',
    '作成日',
    '作成時間',
    '修正日',
    '修正時間',
    '所属寺院ID'
  ];

  const transactionRows = filteredTransactions.map((t) => {
    const [cDate, cTime, uDate, uTime] = getAuditRowValues(t);
    return [
      t.id,
      getTempleLabel(t.templeId),
      t.date || '',
      t.type || '収入',
      t.category || '',
      t.amount || 0,
      t.householdHeadName || '',
      t.paymentMethod || '現金受付',
      t.receiptNumber || '',
      t.householdId || '',
      t.notes || '',
      cDate,
      cTime,
      uDate,
      uTime,
      getTempleId(t.templeId)
    ];
  });

  // 9. Master Options Rows (区分・勘定科目マスタ) - Unified with Excel
  const masterHeaders = [
    '区分１',
    '区分２',
    '総代・世話人',
    '収入の部 (勘定科目)',
    '支出の部 (勘定科目)',
    '決済方法'
  ];

  const map = exportOptions?.templeMasterOptionsMap || {};

  const makeMasterRows = (m: MasterOptions): string[][] => {
    const hTypes = m.householdTypes ?? [];
    const sts = m.statuses ?? [];
    const dsts = m.districts ?? [];
    const incs = m.incomeCategories ?? [];
    const exps = m.expenseCategories ?? [];
    const pays = m.paymentMethods ?? [];

    const maxMasterRows = Math.max(
      hTypes.length,
      sts.length,
      dsts.length,
      incs.length,
      exps.length,
      pays.length
    );

    const rows: string[][] = [];
    for (let i = 0; i < maxMasterRows; i++) {
      rows.push([
        hTypes[i] || '',
        sts[i] || '',
        dsts[i] || '',
        incs[i] || '',
        exps[i] || '',
        pays[i] || ''
      ]);
    }
    return rows;
  };

  // 10. Notice Template Rows (案内文テンプレート) - Unified with Excel
  const allTemplatesList = getAllSavedNoticeTemplates();
  const templateHeaders = ['テンプレートID', 'テンプレート名称', '用紙種別', '法要区分', '案内文本文', '最終更新日時'];
  const templateRows = allTemplatesList.map((t) => [
    t.id,
    t.name,
    t.type === 'a4' ? 'A4用紙' : '官製はがき',
    t.category === 'higan' ? '彼岸法要' : t.category === 'niibon' ? '新盆法要' : t.category === 'memorial' ? '年回忌法要' : t.category === 'general' ? '年中行事' : '自由文書',
    t.content || '',
    new Date().toLocaleString('ja-JP'),
  ]);

  // Prepare batchUpdate update data and clear ranges
  const updateDataList: { range: string; values: any[][] }[] = [];
  const clearRanges: string[] = [];
  const sheetCapacities: { sheetName: string; requiredRows: number; requiredCols: number }[] = [];

  // Helper to calculate required columns
  const getColCount = (headers: string[], rows: any[][]): number => {
    let max = headers.length;
    for (const r of rows) {
      if (r && r.length > max) max = r.length;
    }
    return max;
  };

  // Helper to chunk large arrays into manageable sizes for Google Sheets API limits (unlimited total dataset size)
  const addChunkedUpdates = (sheetName: string, allRows: any[][], chunkSize = 1000) => {
    if (!shouldIncludeSheet(sheetName)) return;

    // Even if rows are empty (e.g. cleared state), include sheet in clearRanges
    clearRanges.push(`'${sheetName.replace(/'/g, "''")}'`);

    if (allRows.length === 0) return;
    
    // Register needed capacity for automatic grid expansion (no row/column limits)
    const maxCols = allRows.reduce((max, r) => (r && r.length > max ? r.length : max), 1);
    sheetCapacities.push({
      sheetName,
      requiredRows: allRows.length,
      requiredCols: maxCols,
    });

    for (let i = 0; i < allRows.length; i += chunkSize) {
      const chunk = allRows.slice(i, i + chunkSize);
      const startRow = i + 1;
      updateDataList.push({
        range: `'${sheetName.replace(/'/g, "''")}'!A${startRow}`,
        values: chunk,
      });
    }
  };

  const mainTempleSheetName = isIndividualExport ? '寺院情報' : '寺院一覧（本寺・兼務）';
  addChunkedUpdates(mainTempleSheetName, [templeHeaders, ...templeRows]);

  addChunkedUpdates('檀家名簿', [householdHeaders, ...householdRows]);
  addChunkedUpdates('家族構成', [familyHeaders, ...familyRows]);
  addChunkedUpdates('過去帳', [pastRecordHeaders, ...pastRows]);
  addChunkedUpdates('法事予約', [memorialServiceHeaders, ...memorialRows]);
  addChunkedUpdates('寺院ToDo', [todoHeaders, ...todoRows]);
  addChunkedUpdates('出納・会計', [transactionHeaders, ...transactionRows]);

  if (isIndividualExport && currentSingleTemple) {
    const templeMaster = getTempleMasterOptions(targetTempleId, map, allTemples, currentMaster);
    const sheetName = `マスタ_${currentSingleTemple.shortName || currentSingleTemple.name}`;
    addChunkedUpdates(sheetName, [masterHeaders, ...makeMasterRows(templeMaster)]);
  } else {
    allTemples.forEach((t) => {
      const tId = t.id || 'temple-main';
      const templeMaster = getTempleMasterOptions(tId, map, allTemples, currentMaster);
      const sheetName = `マスタ_${t.shortName || t.name}`;
      addChunkedUpdates(sheetName, [masterHeaders, ...makeMasterRows(templeMaster)]);
    });
  }

  addChunkedUpdates('案内文テンプレート', [templateHeaders, ...templateRows]);

  // 11. Priests List (登録僧侶一覧)
  const priestHeaders = [
    '僧侶ID',
    '所属寺院',
    '僧侶名',
    'フリガナ',
    '役職・区分',
    '所属寺院名',
    '電話番号',
    'メールアドレス',
    '備考・特記',
    '自動連携区分',
    '所属寺院ID'
  ];

  const priestsToExport: Priest[] = exportOptions?.priests && exportOptions.priests.length > 0
    ? exportOptions.priests
    : allTemples.map((t) => ({
        id: `priest-chief-${t.id || 'temple-main'}`,
        name: t.chiefPriest || '',
        furigana: '',
        role: t.isMain ? '本寺住職' : '兼務寺住職',
        templeId: t.id || 'temple-main',
        templeName: `${t.mountainName ? t.mountainName + ' ' : ''}${t.name}`,
        phone: t.phone || '',
        notes: t.isMain ? '本寺代表役員住職' : '兼務寺住職',
        isAutoChief: true,
        isMainChief: t.isMain || false,
      })).filter((p) => p.name.trim() !== '');

  const priestRows = priestsToExport.map((p) => [
    p.id,
    getTempleLabel(p.templeId),
    p.name || '',
    p.furigana || '',
    p.role || '僧侶',
    p.templeName || getTempleLabel(p.templeId),
    p.phone || '',
    p.email || '',
    p.notes || '',
    p.isAutoChief ? '住職自動連携' : '手動登録',
    getTempleId(p.templeId),
  ]);

  addChunkedUpdates('登録僧侶一覧', [priestHeaders, ...priestRows]);

  // 12. Batch Accounting Config (一括会計設定: 設定情報専用テーブル)
  const activeBatchData = exportOptions?.batchAccountingData !== undefined
    ? exportOptions.batchAccountingData
    : getSavedBatchAccountingData(targetTempleId);
  const activeBatchConfig = getSavedBatchAccountingConfig(targetTempleId) || (activeBatchData ? {
    id: `config-${targetTempleId}`,
    configDate: activeBatchData.configDate,
    cat1: activeBatchData.cat1,
    notes1: activeBatchData.notes1,
    defaultAmount1: activeBatchData.defaultAmount1,
    cat2: activeBatchData.cat2,
    notes2: activeBatchData.notes2,
    defaultAmount2: activeBatchData.defaultAmount2,
    cat3: activeBatchData.cat3,
    notes3: activeBatchData.notes3,
    defaultAmount3: activeBatchData.defaultAmount3,
    appliedPreset: activeBatchData.appliedPreset,
    templeId: activeBatchData.templeId,
    lastSavedAt: activeBatchData.lastSavedAt,
  } : undefined);
  const { headers: batchConfigHeaders, rows: batchConfigRows } = convertBatchAccountingConfigToRows(
    activeBatchConfig,
    allTemples
  );
  addChunkedUpdates('一括会計設定', [batchConfigHeaders, ...batchConfigRows]);

  // 13. Batch Accounting Reception Entries (一括会計受付: 世帯入力明細テーブル)
  const { headers: batchHeaders, rows: batchRows } = convertBatchAccountingToRows(
    activeBatchData || undefined,
    filteredHouseholds,
    allTemples
  );
  addChunkedUpdates('一括会計受付', [batchHeaders, ...batchRows]);

  // 14. Operation & Deletion History (操作・削除履歴: Undo/Redo & 削除同期用)
  const deletedHeaders = [
    '履歴ID',
    '種別',
    '対象エンティティ',
    '対象ID',
    '対象名称/内容',
    '削除・操作日時',
    '日時(ms)',
    '所属寺院',
    '所属寺院ID'
  ];

  const deletedLogsToExport: DeletedRecordEntry[] = (exportOptions?.deletedRecords && exportOptions.deletedRecords.length > 0)
    ? exportOptions.deletedRecords
    : loadDeletedRecordsLog();

  const deletedRows = deletedLogsToExport.slice(0, MAX_DELETED_LOG_LENGTH).map((entry, idx) => [
    `DEL-${idx + 1}`,
    entry.actionType || 'delete',
    entry.entityType || '',
    entry.id || '',
    entry.label || '',
    entry.deletedAt || '',
    String(entry.deletedTimestamp || ''),
    getTempleLabel(entry.templeId),
    getTempleId(entry.templeId),
  ]);

  addChunkedUpdates('操作・削除履歴', [deletedHeaders, ...deletedRows]);

  // 15. Disaster & War Memorial Events (戦没・災害物故者命日設定)
  const disasterEvents = getSavedDisasterMemorialEvents();
  const { headers: disasterHeaders, rows: disasterRows } = convertDisasterEventsToRows(disasterEvents);
  addChunkedUpdates('戦没・災害物故者命日設定', [disasterHeaders, ...disasterRows]);

  // 1. Ensure sheet grid capacities (rows & columns) are dynamically expanded so no max bound error occurs
  await ensureSheetGridCapacities(accessToken, spreadsheetId, sheetCapacities);

  // 2. Clear ranges completely using actual existing sheet titles from spreadsheet metadata
  try {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`;
    const metaRes = await fetchWithRetry(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      const existingSheetTitles: string[] = (metaData.sheets || []).map((s: any) => s.properties?.title || '').filter(Boolean);

      // Determine ranges to clear based on whether it's a specific table export or a full export
      let rangesToClear: string[] = [];
      if (!targetTablesFilter) {
        // Full export: clear all existing sheets in the spreadsheet
        rangesToClear = existingSheetTitles.map((title) => `'${title.replace(/'/g, "''")}'`);
      } else {
        // Specific table export: only clear existing sheets that match the filter
        rangesToClear = existingSheetTitles
          .filter((title) => shouldIncludeSheet(title))
          .map((title) => `'${title.replace(/'/g, "''")}'`);
      }

      if (rangesToClear.length > 0) {
        const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`;
        const clearRes = await fetchWithRetry(clearUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ranges: rangesToClear }),
        });

        if (!clearRes.ok) {
          console.warn('batchClear returned non-ok, falling back to per-sheet clear in exportToSheets');
          for (const title of existingSheetTitles) {
            if (targetTablesFilter && !shouldIncludeSheet(title)) continue;
            const singleClearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(title)}':clear`;
            await fetchWithRetry(singleClearUrl, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }).catch((e) => console.warn(`Failed to clear sheet ${title}:`, e));
          }
        }
      }
    }
  } catch (clearErr) {
    console.warn('Batch clear warning:', clearErr);
  }

  // 3. Batch update with new data (chunk requests if total payload is large)
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const BATCH_CHUNK_SIZE = 5; // send up to 5 sheet chunks per HTTP POST request to avoid HTTP 413
  for (let i = 0; i < updateDataList.length; i += BATCH_CHUNK_SIZE) {
    const chunkUpdates = updateDataList.slice(i, i + BATCH_CHUNK_SIZE);
    const payload = {
      valueInputOption: 'USER_ENTERED',
      data: chunkUpdates,
    };

    const res = await fetchWithRetry(updateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      handleGoogleApiError(res, errJson, 'Google スプレッドシートへの書き込みに失敗しました');
    }
  }
}

/**
 * Cleanly write and replace specific table(s) in Google Sheets with local terminal records.
 * Clears the existing rows of specified table(s) and replaces with local records without touching other sheets.
 */
export async function exportSpecificTablesToSheets(
  accessToken: string,
  spreadsheetId: string,
  targetTables: string[],
  templeInfo: TempleInfo,
  households: Household[],
  pastRecords: PastRecord[],
  memorialServices: MemorialService[],
  transactions: Transaction[],
  masterOptions?: MasterOptions,
  noticeTemplates?: { higan: string; niibon: string },
  templeTodos?: TempleTodo[],
  temples?: TempleProfile[],
  exportOptions?: {
    targetTempleId?: string | 'ALL';
    templeMasterOptionsMap?: Record<string, MasterOptions>;
    priests?: Priest[];
    deletedRecords?: DeletedRecordEntry[];
    batchAccountingData?: BatchAccountingData;
  }
): Promise<void> {
  return exportToSheets(
    accessToken,
    spreadsheetId,
    templeInfo,
    households,
    pastRecords,
    memorialServices,
    transactions,
    masterOptions,
    noticeTemplates,
    templeTodos,
    temples,
    {
      ...exportOptions,
      targetTablesOnly: targetTables,
    }
  );
}

export interface SheetsImportResult {
  templeInfo?: TempleInfo;
  temples?: TempleProfile[];
  households: Household[];
  familyMembers: FamilyMember[];
  pastRecords: PastRecord[];
  memorialServices: MemorialService[];
  transactions: Transaction[];
  masterOptions?: MasterOptions;
  templeMasterOptionsMap?: Record<string, MasterOptions>;
  noticeTemplates?: { higan: string; niibon: string };
  templeTodos?: TempleTodo[];
  priests?: Priest[];
  deletedRecords?: DeletedRecordEntry[];
  batchAccountingData?: BatchAccountingData;
  hasAnyData: boolean;
  totalRecordsCount: number;
}

// Import all app data from Google Sheets (matching Excel specification exactly)
export async function importFromSheets(
  accessToken: string,
  spreadsheetId: string,
  options?: {
    targetTempleId?: string | 'ALL';
    defaultTempleId?: string;
  }
): Promise<SheetsImportResult> {
  // 1. Fetch spreadsheet metadata including gridProperties (rowCount, columnCount) to safely paginate large sheets
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties)`;
  const metaRes = await fetchWithRetry(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaRes.ok) {
    const errorBody = await metaRes.json().catch(() => ({}));
    handleGoogleApiError(metaRes, errorBody, 'Google スプレッドシートのメタデータ取得に失敗しました');
  }

  const metaData = await metaRes.json();
  const rawSheets: any[] = metaData.sheets || [];
  const allSheetNames: string[] = rawSheets.map((s: any) => s.properties?.title || '').filter(Boolean);

  if (allSheetNames.length === 0) {
    throw new Error('スプレッドシート内にシートが見つかりませんでした。');
  }

  // 2. Fetch all sheet data safely:
  // For sheets with large row counts (e.g. tens of thousands of rows for Accounting, PastRecords, Todos, Households),
  // chunk by row ranges (e.g. 2,000 rows per request) to prevent Google Sheets API 10MB payload / timeout limits.
  const sheetDataMap = new Map<string, { headers: string[]; rows: string[][] }>();
  const CHUNK_ROW_SIZE = 2000;

  for (const sheetObj of rawSheets) {
    const title = sheetObj.properties?.title;
    if (!title) continue;

    const rowCount = sheetObj.properties?.gridProperties?.rowCount || 1000;
    const escapedTitle = title.replace(/'/g, "''");

    // If sheet has 2,000 rows or fewer, fetch whole sheet in one request
    if (rowCount <= CHUNK_ROW_SIZE) {
      try {
        const singleUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${escapedTitle}'`)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
        const singleRes = await fetchWithRetry(singleUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (singleRes.ok) {
          const data = await singleRes.json();
          const values: string[][] = data.values || [];
          if (values.length > 0) {
            const headers = (values[0] || []).map((h) => String(h || '').trim());
            const rows = values.slice(1);
            sheetDataMap.set(title, { headers, rows });
          } else {
            sheetDataMap.set(title, { headers: [], rows: [] });
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch sheet "${title}":`, err);
      }
      continue;
    }

    // Large sheet with > 2,000 rows: fetch in 2,000-row chunks until empty or rowCount reached
    let allSheetHeaders: string[] = [];
    const allSheetRows: string[][] = [];
    let startRow = 1;
    let keepFetching = true;

    while (keepFetching && startRow <= rowCount + 1000) {
      const endRow = startRow + CHUNK_ROW_SIZE - 1;
      const rangeStr = `'${escapedTitle}'!A${startRow}:ZZ${endRow}`;
      const chunkUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeStr)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;

      try {
        const chunkRes = await fetchWithRetry(chunkUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (chunkRes.ok) {
          const chunkData = await chunkRes.json();
          const chunkValues: string[][] = chunkData.values || [];

          if (chunkValues.length === 0) {
            // No more data in subsequent chunks
            keepFetching = false;
            break;
          }

          if (startRow === 1) {
            // First chunk contains headers
            allSheetHeaders = (chunkValues[0] || []).map((h) => String(h || '').trim());
            const dataRows = chunkValues.slice(1);
            if (dataRows.length > 0) {
              allSheetRows.push(...dataRows);
            }
            // If fewer rows returned than requested range, reached end of data
            if (chunkValues.length < CHUNK_ROW_SIZE) {
              keepFetching = false;
            }
          } else {
            // Subsequent chunks contain only data rows
            allSheetRows.push(...chunkValues);
            if (chunkValues.length < CHUNK_ROW_SIZE) {
              keepFetching = false;
            }
          }

          startRow += CHUNK_ROW_SIZE;
        } else {
          console.warn(`Failed to fetch chunk ${rangeStr} for sheet "${title}" (HTTP ${chunkRes.status})`);
          keepFetching = false;
        }
      } catch (chunkErr) {
        console.warn(`Exception fetching chunk ${rangeStr} for sheet "${title}":`, chunkErr);
        keepFetching = false;
      }
    }

    sheetDataMap.set(title, { headers: allSheetHeaders, rows: allSheetRows });
  }

  const getSheetDataByName = (sheetName?: string): { headers: string[]; rows: string[][] } => {
    if (!sheetName) return { headers: [], rows: [] };
    if (sheetDataMap.has(sheetName)) {
      return sheetDataMap.get(sheetName)!;
    }
    for (const [key, val] of sheetDataMap.entries()) {
      if (
        key === sheetName ||
        key.toLowerCase() === sheetName.toLowerCase() ||
        key.replace(/[\s_（）()]/g, '') === sheetName.replace(/[\s_（）()]/g, '')
      ) {
        return val;
      }
    }
    return { headers: [], rows: [] };
  };

  const findSheet = (aliases: string[]): string | undefined => {
    for (const a of aliases) {
      const found = allSheetNames.find((name) => {
        const cleanName = name.toLowerCase().replace(/[\s_（）()]/g, '');
        const cleanA = a.toLowerCase().replace(/[\s_（）()]/g, '');
        return cleanName === cleanA || cleanName.includes(cleanA);
      });
      if (found) return found;
    }
    return undefined;
  };

  const cleanStr = (s: string) => String(s || '').trim().toLowerCase().replace(/[\s\r\n_（）()【】\[\]/・\-]/g, '');

  const findColIdx = (headers: string[], aliases: string[]): number => {
    if (!headers || headers.length === 0) return -1;
    const cleanHeaders = headers.map(cleanStr);

    // 1. Exact match pass (highest priority)
    for (const a of aliases) {
      const cleanA = cleanStr(a);
      if (!cleanA) continue;
      const idx = cleanHeaders.findIndex((h) => h === cleanA);
      if (idx !== -1) return idx;
    }

    // 2. Contains match pass (only when alias is specific and header contains alias; NEVER alias contains header)
    for (const a of aliases) {
      const cleanA = cleanStr(a);
      if (!cleanA || cleanA.length < 2) continue;
      // Do not allow generic short words to match longer composite column headers
      if (['id', 'no', '名', '区分', '金額', '種別', '状態', '役職', '備考', 'メモ'].includes(cleanA)) continue;

      const idx = cleanHeaders.findIndex((h) => h.includes(cleanA));
      if (idx !== -1) return idx;
    }

    return -1;
  };

  // 1. Parse Temple Profiles List (寺院一覧（本寺・兼務） / 寺院一覧 / 寺院情報)
  const templeSheetName = findSheet(['寺院一覧（本寺・兼務）', '寺院一覧', '寺院情報', '寺院プロファイル']);
  const { headers: templeHeaders, rows: templeListRows } = getSheetDataByName(templeSheetName);
  const parsedTemples: TempleProfile[] = [];

  if (templeListRows.length > 0) {
    const tIdIdx = findColIdx(templeHeaders, ['寺院ID', 'ID', 'id']);
    const isMainIdx = findColIdx(templeHeaders, ['寺院区分', '区分', '種別', 'isMain']);
    const nameIdx = findColIdx(templeHeaders, ['寺院名', '名称', 'name']);
    const mountainIdx = findColIdx(templeHeaders, ['山号', 'mountainName']);
    const sectIdx = findColIdx(templeHeaders, ['宗派', 'sect']);
    const priestIdx = findColIdx(templeHeaders, ['住職名', '住職', 'chiefPriest']);
    const zipIdx = findColIdx(templeHeaders, ['郵便番号', 'postalCode']);
    const addrIdx = findColIdx(templeHeaders, ['住所', 'address']);
    const phoneIdx = findColIdx(templeHeaders, ['電話番号', '電話', 'phone']);
    const faxIdx = findColIdx(templeHeaders, ['FAX番号', 'FAX', 'fax']);
    const webIdx = findColIdx(templeHeaders, ['ホームページ', 'HP', 'website']);
    const bankIdx = findColIdx(templeHeaders, ['銀行振込口座', '口座', '銀行口座', 'bankInfo']);
    const bonIdx = findColIdx(templeHeaders, ['お盆時期', 'お盆', '盆時期', 'bonSeason']);
    const fySmIdx = findColIdx(templeHeaders, ['会計年度開始月', '年度開始月', 'fiscalYearStartMonth']);
    const fySdIdx = findColIdx(templeHeaders, ['会計年度開始日', '年度開始日', 'fiscalYearStartDay']);
    const fyEmIdx = findColIdx(templeHeaders, ['会計年度終了月', '年度終了月', 'fiscalYearEndMonth']);
    const fyEdIdx = findColIdx(templeHeaders, ['会計年度終了日', '年度終了日', 'fiscalYearEndDay']);
    const toba1Idx = findColIdx(templeHeaders, ['塔婆申込１', '塔婆申込1', '塔婆申込１名称', '塔婆申込1名称', '塔婆1', '塔婆１', 'tobaType1']);
    const toba2Idx = findColIdx(templeHeaders, ['塔婆申込２', '塔婆申込2', '塔婆申込２名称', '塔婆申込2名称', '塔婆2', '塔婆２', 'tobaType2']);
    const toba3Idx = findColIdx(templeHeaders, ['塔婆申込３', '塔婆申込3', '塔婆申込３名称', '塔婆申込3名称', '塔婆3', '塔婆３', 'tobaType3']);
    const fee1Idx = findColIdx(templeHeaders, ['集金項目１', '集金項目1', '集金1', '集金１', 'feeType1']);
    const fee1CatIdx = findColIdx(templeHeaders, ['集金項目１勘定科目', '集金項目1勘定科目', '集金１勘定科目', '集金1勘定科目', '集金項目１科目', '集金1科目', 'feeType1Category']);
    const fee1AmtIdx = findColIdx(templeHeaders, ['集金項目１基準金額', '集金項目1基準金額', '集金１基準金額', '集金1基準金額', '集金項目１標準金額', '集金1標準金額', '集金１金額', '集金1金額', 'feeType1DefaultAmount']);
    const fee2Idx = findColIdx(templeHeaders, ['集金項目２', '集金項目2', '集金2', '集金２', 'feeType2']);
    const fee2CatIdx = findColIdx(templeHeaders, ['集金項目２勘定科目', '集金項目2勘定科目', '集金２勘定科目', '集金2勘定科目', '集金項目２科目', '集金2科目', 'feeType2Category']);
    const fee2AmtIdx = findColIdx(templeHeaders, ['集金項目２基準金額', '集金項目2基準金額', '集金２基準金額', '集金2基準金額', '集金項目２標準金額', '集金2標準金額', '集金２金額', '集金2金額', 'feeType2DefaultAmount']);
    const fee3Idx = findColIdx(templeHeaders, ['集金項目３', '集金項目3', '集金3', '集金３', 'feeType3']);
    const fee3CatIdx = findColIdx(templeHeaders, ['集金項目３勘定科目', '集金項目3勘定科目', '集金３勘定科目', '集金3勘定科目', '集金項目３科目', '集金3科目', 'feeType3Category']);
    const fee3AmtIdx = findColIdx(templeHeaders, ['集金項目３基準金額', '集金項目3基準金額', '集金３基準金額', '集金3基準金額', '集金項目３標準金額', '集金3標準金額', '集金３金額', '集金3金額', 'feeType3DefaultAmount']);
    const evNotesIdx = findColIdx(templeHeaders, ['年間行事特記', '行事特記', 'annualEventsNotes']);
    const colorIdx = findColIdx(templeHeaders, ['テーマカラー', 'カラー', 'color']);
    const updIdx = findColIdx(templeHeaders, ['更新日時', 'updatedAt', '更新日', 'タイムスタンプ']);
    const creIdx = findColIdx(templeHeaders, ['作成日時', 'createdAt', '作成日']);

    for (let i = 0; i < templeListRows.length; i++) {
      const row = templeListRows[i];
      if (!row || row.length === 0 || !row[0]) continue;
      const tId = String((tIdIdx !== -1 ? row[tIdIdx] : row[0]) || '').trim();
      const rawIsMain = isMainIdx !== -1 ? String(row[isMainIdx] || '') : String(row[1] || '');
      const isMain = rawIsMain.includes('本寺') || rawIsMain.toLowerCase() === 'true' || i === 0;

      const bonSeason = bonIdx !== -1 && row[bonIdx] ? (String(row[bonIdx]).trim() as any) : undefined;
      const fiscalYearStartMonth = fySmIdx !== -1 && row[fySmIdx] ? parseInt(String(row[fySmIdx]), 10) || undefined : undefined;
      const fiscalYearStartDay = fySdIdx !== -1 && row[fySdIdx] ? parseInt(String(row[fySdIdx]), 10) || undefined : undefined;
      const fiscalYearEndMonth = fyEmIdx !== -1 && row[fyEmIdx] ? parseInt(String(row[fyEmIdx]), 10) || undefined : undefined;
      const fiscalYearEndDay = fyEdIdx !== -1 && row[fyEdIdx] ? parseInt(String(row[fyEdIdx]), 10) || undefined : undefined;
      const tobaType1 = toba1Idx !== -1 && row[toba1Idx] !== undefined && row[toba1Idx] !== '' ? String(row[toba1Idx]).trim() : undefined;
      const tobaType2 = toba2Idx !== -1 && row[toba2Idx] !== undefined ? String(row[toba2Idx]).trim() : undefined;
      const tobaType3 = toba3Idx !== -1 && row[toba3Idx] !== undefined ? String(row[toba3Idx]).trim() : undefined;
      const feeType1 = fee1Idx !== -1 && row[fee1Idx] !== undefined ? String(row[fee1Idx]).trim() : undefined;
      const feeType1Category = fee1CatIdx !== -1 && row[fee1CatIdx] !== undefined ? String(row[fee1CatIdx]).trim() : undefined;
      const fee1AmtRaw = fee1AmtIdx !== -1 ? row[fee1AmtIdx] : undefined;
      const feeType1DefaultAmount = fee1AmtRaw !== undefined && fee1AmtRaw !== '' && !isNaN(Number(String(fee1AmtRaw).replace(/[^0-9.-]/g, ''))) ? Number(String(fee1AmtRaw).replace(/[^0-9.-]/g, '')) : undefined;
      const feeType2 = fee2Idx !== -1 && row[fee2Idx] !== undefined ? String(row[fee2Idx]).trim() : undefined;
      const feeType2Category = fee2CatIdx !== -1 && row[fee2CatIdx] !== undefined ? String(row[fee2CatIdx]).trim() : undefined;
      const fee2AmtRaw = fee2AmtIdx !== -1 ? row[fee2AmtIdx] : undefined;
      const feeType2DefaultAmount = fee2AmtRaw !== undefined && fee2AmtRaw !== '' && !isNaN(Number(String(fee2AmtRaw).replace(/[^0-9.-]/g, ''))) ? Number(String(fee2AmtRaw).replace(/[^0-9.-]/g, '')) : undefined;
      const feeType3 = fee3Idx !== -1 && row[fee3Idx] !== undefined ? String(row[fee3Idx]).trim() : undefined;
      const feeType3Category = fee3CatIdx !== -1 && row[fee3CatIdx] !== undefined ? String(row[fee3CatIdx]).trim() : undefined;
      const fee3AmtRaw = fee3AmtIdx !== -1 ? row[fee3AmtIdx] : undefined;
      const feeType3DefaultAmount = fee3AmtRaw !== undefined && fee3AmtRaw !== '' && !isNaN(Number(String(fee3AmtRaw).replace(/[^0-9.-]/g, ''))) ? Number(String(fee3AmtRaw).replace(/[^0-9.-]/g, '')) : undefined;
      const annualEventsNotes = evNotesIdx !== -1 && row[evNotesIdx] ? String(row[evNotesIdx]).trim() : undefined;
      const updatedAt = updIdx !== -1 && row[updIdx] ? String(row[updIdx]).trim() : undefined;
      const createdAt = creIdx !== -1 && row[creIdx] ? String(row[creIdx]).trim() : undefined;

      parsedTemples.push({
        id: tId || (isMain ? 'temple-main' : `temple-sub-${i + 1}`),
        isMain,
        name: String((nameIdx !== -1 ? row[nameIdx] : row[2]) || (isMain ? INITIAL_TEMPLE_INFO.name : `兼務寺院${i + 1}`)).trim(),
        mountainName: String((mountainIdx !== -1 ? row[mountainIdx] : row[3]) || '').trim(),
        sect: String((sectIdx !== -1 ? row[sectIdx] : row[4]) || INITIAL_TEMPLE_INFO.sect).trim(),
        chiefPriest: String((priestIdx !== -1 ? row[priestIdx] : row[5]) || '').trim(),
        postalCode: String((zipIdx !== -1 ? row[zipIdx] : row[6]) || '').trim(),
        address: String((addrIdx !== -1 ? row[addrIdx] : row[7]) || '').trim(),
        phone: String((phoneIdx !== -1 ? row[phoneIdx] : row[8]) || '').trim(),
        fax: String((faxIdx !== -1 ? row[faxIdx] : row[9]) || '').trim(),
        website: String((webIdx !== -1 ? row[webIdx] : row[10]) || '').trim(),
        bankInfo: String((bankIdx !== -1 ? row[bankIdx] : row[11]) || '').trim(),
        bonSeason,
        fiscalYearStartMonth,
        fiscalYearStartDay,
        fiscalYearEndMonth,
        fiscalYearEndDay,
        tobaType1: tobaType1 !== undefined ? tobaType1 : (isMain ? '施餓鬼塔婆' : undefined),
        tobaType2,
        tobaType3,
        feeType1,
        feeType1Category,
        feeType1DefaultAmount,
        feeType2,
        feeType2Category,
        feeType2DefaultAmount,
        feeType3,
        feeType3Category,
        feeType3DefaultAmount,
        annualEventsNotes,
        color: String((colorIdx !== -1 ? row[colorIdx] : row[12]) || (isMain ? '#D4AF37' : '#1F4E79')).trim(),
        updatedAt,
        createdAt,
      });
    }
  }

  // 2. Parse Single Temple Info (寺院基本情報)
  const templeInfoSheetName = findSheet(['寺院基本情報', '基本情報', '自寺情報']);
  const { rows: templeValues } = getSheetDataByName(templeInfoSheetName);
  let templeInfo: TempleInfo | undefined;
  if (templeValues.length > 0) {
    const map = new Map<string, string>();
    templeValues.forEach((row) => {
      if (row.length >= 2) {
        map.set(String(row[0] || '').trim(), String(row[1] || '').trim());
      }
    });

    if (map.get('寺院名') || map.get('寺院名（本寺）')) {
      const fySm = map.get('会計年度開始月') ? parseInt(map.get('会計年度開始月')!, 10) || undefined : undefined;
      const fySd = map.get('会計年度開始日') ? parseInt(map.get('会計年度開始日')!, 10) || undefined : undefined;
      const fyEm = map.get('会計年度終了月') ? parseInt(map.get('会計年度終了月')!, 10) || undefined : undefined;
      const fyEd = map.get('会計年度終了日') ? parseInt(map.get('会計年度終了日')!, 10) || undefined : undefined;
      const bon = map.get('お盆時期') as any;
      const toba1 = map.get('塔婆申込１') || map.get('塔婆申込1') || map.get('塔婆申込１名称');
      const toba2 = map.get('塔婆申込２') || map.get('塔婆申込2') || map.get('塔婆申込２名称');
      const toba3 = map.get('塔婆申込３') || map.get('塔婆申込3') || map.get('塔婆申込３名称');
      const fee1 = map.get('集金項目１') || map.get('集金項目1') || map.get('集金1') || map.get('集金１');
      const fee1Cat = map.get('集金項目１勘定科目') || map.get('集金項目1勘定科目') || map.get('集金１勘定科目') || map.get('集金1勘定科目') || map.get('集金項目１科目') || map.get('集金1科目');
      const fee1AmtRaw = map.get('集金項目１基準金額') || map.get('集金項目1基準金額') || map.get('集金１基準金額') || map.get('集金1基準金額') || map.get('集金項目１標準金額') || map.get('集金1標準金額');
      const fee1Amt = fee1AmtRaw && !isNaN(Number(fee1AmtRaw.replace(/[^0-9.-]/g, ''))) ? Number(fee1AmtRaw.replace(/[^0-9.-]/g, '')) : undefined;
      const fee2 = map.get('集金項目２') || map.get('集金項目2') || map.get('集金2') || map.get('集金２');
      const fee2Cat = map.get('集金項目２勘定科目') || map.get('集金項目2勘定科目') || map.get('集金２勘定科目') || map.get('集金2勘定科目') || map.get('集金項目２科目') || map.get('集金2科目');
      const fee2AmtRaw = map.get('集金項目２基準金額') || map.get('集金項目2基準金額') || map.get('集金２基準金額') || map.get('集金2基準金額') || map.get('集金項目２標準金額') || map.get('集金2標準金額');
      const fee2Amt = fee2AmtRaw && !isNaN(Number(fee2AmtRaw.replace(/[^0-9.-]/g, ''))) ? Number(fee2AmtRaw.replace(/[^0-9.-]/g, '')) : undefined;
      const fee3 = map.get('集金項目３') || map.get('集金項目3') || map.get('集金3') || map.get('集金３');
      const fee3Cat = map.get('集金項目３勘定科目') || map.get('集金項目3勘定科目') || map.get('集金３勘定科目') || map.get('集金3勘定科目') || map.get('集金項目３科目') || map.get('集金3科目');
      const fee3AmtRaw = map.get('集金項目３基準金額') || map.get('集金項目3基準金額') || map.get('集金３基準金額') || map.get('集金3基準金額') || map.get('集金項目３標準金額') || map.get('集金3標準金額');
      const fee3Amt = fee3AmtRaw && !isNaN(Number(fee3AmtRaw.replace(/[^0-9.-]/g, ''))) ? Number(fee3AmtRaw.replace(/[^0-9.-]/g, '')) : undefined;
      const evNotes = map.get('年間行事特記');
      const uAt = map.get('更新日時') || map.get('修正日時') || map.get('最終更新日時') || map.get('最終出力日時');
      const uDate = map.get('修正日') || map.get('更新日');
      const uTime = map.get('修正時間') || map.get('更新時間');

      templeInfo = {
        id: 'temple-main',
        isMain: true,
        name: map.get('寺院名') || map.get('寺院名（本寺）') || INITIAL_TEMPLE_INFO.name,
        sect: map.get('宗派') || INITIAL_TEMPLE_INFO.sect,
        mountainName: map.get('山号') || INITIAL_TEMPLE_INFO.mountainName,
        chiefPriest: map.get('住職名') || '',
        postalCode: map.get('郵便番号') || '',
        address: map.get('住所') || '',
        phone: map.get('電話番号') || '',
        fax: map.get('FAX番号') || '',
        website: map.get('ホームページ') || '',
        bankInfo: map.get('銀行振込口座') || '',
        bonSeason: bon || undefined,
        fiscalYearStartMonth: fySm,
        fiscalYearStartDay: fySd,
        fiscalYearEndMonth: fyEm,
        fiscalYearEndDay: fyEd,
        tobaType1: toba1 !== undefined ? toba1 : '施餓鬼塔婆',
        tobaType2: toba2 || undefined,
        tobaType3: toba3 || undefined,
        feeType1: fee1 || undefined,
        feeType1Category: fee1Cat || undefined,
        feeType1DefaultAmount: fee1Amt,
        feeType2: fee2 || undefined,
        feeType2Category: fee2Cat || undefined,
        feeType2DefaultAmount: fee2Amt,
        feeType3: fee3 || undefined,
        feeType3Category: fee3Cat || undefined,
        feeType3DefaultAmount: fee3Amt,
        annualEventsNotes: evNotes || undefined,
        updatedAt: uAt || undefined,
        updatedDate: uDate || undefined,
        updatedTime: uTime || undefined,
      };
    }
  }

  let temples: TempleProfile[] | undefined = undefined;
  if (parsedTemples.length > 0) {
    temples = parsedTemples;
    if (!templeInfo && parsedTemples[0]) {
      templeInfo = parsedTemples[0];
    }
  } else if (templeInfo) {
    temples = [{ ...templeInfo, id: 'temple-main', isMain: true }];
  }

  const templeNameToIdMap = new Map<string, string>();
  if (temples) {
    temples.forEach((t) => {
      if (t.id) {
        if (t.name) templeNameToIdMap.set(t.name.trim(), t.id);
        if (t.shortName) templeNameToIdMap.set(t.shortName.trim(), t.id);
        if (t.mountainName && t.name) {
          templeNameToIdMap.set(`${t.mountainName} ${t.name}`.trim(), t.id);
        }
      }
    });
  }

  // 2-2. Parse Temple Annual Events (寺院年間行事 / 年間行事計画)
  const annualEventsSheetName = findSheet(['寺院年間行事', '年間行事計画', '年間行事', '行事計画', '寺院行事', '行事一覧']);
  const { headers: aeHeaders, rows: aeValues } = getSheetDataByName(annualEventsSheetName);
  if (aeValues.length > 0) {
    const idIdx = findColIdx(aeHeaders, ['行事ID', 'ID', 'id', 'No']);
    const templeColIdx = findColIdx(aeHeaders, ['所属寺院', '寺院名', '寺院']);
    const templeIdColIdx = findColIdx(aeHeaders, ['所属寺院ID', '寺院ID', 'templeId']);
    const monthIdx = findColIdx(aeHeaders, ['月', '開催月', 'month']);
    const nameIdx = findColIdx(aeHeaders, ['行事名', '名称', '行事', 'name']);
    const dateDescIdx = findColIdx(aeHeaders, ['日程・時期', '日程', '時期', '日付', 'dateDesc']);
    const descIdx = findColIdx(aeHeaders, ['行事内容・備考', '内容', '備考', '説明', 'description']);

    const templeEventsMap = new Map<string, TempleAnnualEvent[]>();

    aeValues.forEach((row, idx) => {
      if (!row || row.length === 0 || !row[0]) return;
      const name = String((nameIdx !== -1 ? row[nameIdx] : row[3]) || '').trim();
      const rawMonth = monthIdx !== -1 ? row[monthIdx] : row[2];
      const monthNum = parseInt(String(rawMonth || '').replace(/[^0-9]/g, ''), 10);
      const month = !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12 ? monthNum : 1;
      if (!name) return;

      let templeId = options?.defaultTempleId || 'temple-main';
      if (templeIdColIdx !== -1 && row[templeIdColIdx]) {
        templeId = String(row[templeIdColIdx]).trim();
      } else if (templeColIdx !== -1 && row[templeColIdx]) {
        const tVal = String(row[templeColIdx]).trim();
        for (const [tName, id] of templeNameToIdMap.entries()) {
          if (tVal.includes(tName) || tName.includes(tVal)) {
            templeId = id;
            break;
          }
        }
      }

      const evId = String((idIdx !== -1 ? row[idIdx] : row[0]) || `AE-${templeId}-${idx + 1}`).trim();
      const dateDesc = String((dateDescIdx !== -1 ? row[dateDescIdx] : row[4]) || '').trim();
      const description = String((descIdx !== -1 ? row[descIdx] : row[5]) || '').trim();

      const ev: TempleAnnualEvent = {
        id: evId,
        month,
        name,
        dateDesc,
        description,
      };

      if (!templeEventsMap.has(templeId)) {
        templeEventsMap.set(templeId, []);
      }
      templeEventsMap.get(templeId)!.push(ev);
    });

    if (templeEventsMap.size > 0) {
      if (temples && temples.length > 0) {
        temples = temples.map((t) => {
          const evs = templeEventsMap.get(t.id);
          if (evs && evs.length > 0) {
            return { ...t, annualEvents: evs };
          }
          return t;
        });
      }
      if (templeInfo) {
        const mainEvs = templeEventsMap.get('temple-main') || templeEventsMap.get(templeInfo.id || '') || Array.from(templeEventsMap.values())[0];
        if (mainEvs && mainEvs.length > 0) {
          templeInfo = { ...templeInfo, annualEvents: mainEvs };
        }
      }
    }
  }

  // 3. Parse Family Members Map (家族構成)
  const importAudit = getCurrentAuditFields();
  const familySheetName = findSheet(['家族構成', '家族', '家族一覧', '世帯員']);
  const { headers: familyHeaders, rows: familyValues } = getSheetDataByName(familySheetName);
  const familyMembersMap = new Map<string, FamilyMember[]>();
  if (familyValues.length > 0) {
    const isNewFamily = familyHeaders.some((h) => h.includes('所属寺院'));
    const fIdIdx = findColIdx(familyHeaders, ['家族ID', 'ID', 'id', 'No']);
    const hIdIdx = findColIdx(familyHeaders, ['世帯ID (檀家ID)', '世帯ID', '檀家ID', '世帯番号']);
    const nameIdx = findColIdx(familyHeaders, ['氏名', '名前', '家族名']);
    const fFuriIdx = findColIdx(familyHeaders, ['フリガナ', 'ふりがな', 'カナ', '氏名カナ']);
    const relIdx = findColIdx(familyHeaders, ['続柄', '関係']);
    const phoneIdx = findColIdx(familyHeaders, ['電話番号', '電話', '連絡先']);
    const addrIdx = findColIdx(familyHeaders, ['個別住所', '住所', '現住所', '別居住所', '連絡先住所']);
    const chiefIdx = findColIdx(familyHeaders, ['施主指定', '施主フラグ', '施主', 'isChiefMourner', 'isSponsor']);
    const toba1Idx = findColIdx(familyHeaders, ['塔婆申込１', '塔婆申込1', '塔婆１', '塔婆1', '塔婆申込１申込', '施餓鬼塔婆申込', '施餓鬼塔婆', '施餓鬼申込', '施餓鬼', '塔婆申込', 'isSegakiToba', 'toba1Applied']);
    const toba1TamegakiIdx = findColIdx(familyHeaders, ['塔婆申込１為書き', '塔婆申込1為書き', '塔婆１為書き', '塔婆1為書き', '施餓鬼為書き', '為書き', '施餓鬼為書', '為書', 'segakiTamegaki', 'toba1Tamegaki']);
    const toba2Idx = findColIdx(familyHeaders, ['塔婆申込２', '塔婆申込2', '塔婆２', '塔婆2', '塔婆申込２申込', 'toba2Applied']);
    const toba2TamegakiIdx = findColIdx(familyHeaders, ['塔婆申込２為書き', '塔婆申込2為書き', '塔婆２為書き', '塔婆2為書き', 'toba2Tamegaki']);
    const toba3Idx = findColIdx(familyHeaders, ['塔婆申込３', '塔婆申込3', '塔婆３', '塔婆3', '塔婆申込３申込', 'toba3Applied']);
    const toba3TamegakiIdx = findColIdx(familyHeaders, ['塔婆申込３為書き', '塔婆申込3為書き', '塔婆３為書き', '塔婆3為書き', 'toba3Tamegaki']);
    const notesIdx = findColIdx(familyHeaders, ['備考', 'メモ', '特記']);
    const fmCDateIdx = findColIdx(familyHeaders, ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt']);
    const fmCTimeIdx = findColIdx(familyHeaders, ['作成時間', '作成時刻', 'createdTime']);
    const fmUDateIdx = findColIdx(familyHeaders, ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt']);
    const fmUTimeIdx = findColIdx(familyHeaders, ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime']);

    const resolvedHIdIdx = hIdIdx !== -1 ? hIdIdx : (isNewFamily ? 2 : 1);
    const resolvedNameIdx = nameIdx !== -1 ? nameIdx : (isNewFamily ? 3 : 2);
    const resolvedRelIdx = relIdx !== -1 ? relIdx : (isNewFamily ? 4 : 3);
    const resolvedPhoneIdx = phoneIdx !== -1 ? phoneIdx : (isNewFamily ? 5 : 4);
    const resolvedNotesIdx = notesIdx !== -1 ? notesIdx : (isNewFamily ? 6 : 5);

    for (let i = 0; i < familyValues.length; i++) {
      const row = familyValues[i];
      if (!row || row.length === 0 || (!row[0] && !row[resolvedHIdIdx])) continue;
      const hId = String(row[resolvedHIdIdx] || '').trim();
      if (!hId) continue;

      const fFuri = normalizeFurigana(fFuriIdx !== -1 ? row[fFuriIdx] : '');
      const fAddr = String((addrIdx !== -1 ? row[addrIdx] : '') || '').trim();
      const chiefVal = String((chiefIdx !== -1 ? row[chiefIdx] : '') || '').trim();
      const isChief = chiefVal === '施主' || chiefVal === '代表' || chiefVal === '当家' || chiefVal === '1' || chiefVal.toLowerCase() === 'true';
      
      const toba1Val = String((toba1Idx !== -1 ? row[toba1Idx] : '') || '').trim();
      const isToba1 = toba1Val === '申込' || toba1Val === '申込済' || toba1Val === '対象' || toba1Val === '有' || toba1Val === '1' || toba1Val.toLowerCase() === 'true' || (toba1Val.includes('申込') && !toba1Val.includes('未')) || (toba1Val.includes('対象') && !toba1Val.includes('未'));
      const toba1Tamegaki = String((toba1TamegakiIdx !== -1 ? row[toba1TamegakiIdx] : '') || '').trim();

      const toba2Val = String((toba2Idx !== -1 ? row[toba2Idx] : '') || '').trim();
      const isToba2 = toba2Val === '申込' || toba2Val === '申込済' || toba2Val === '対象' || toba2Val === '有' || toba2Val === '1' || toba2Val.toLowerCase() === 'true' || (toba2Val.includes('申込') && !toba2Val.includes('未')) || (toba2Val.includes('対象') && !toba2Val.includes('未'));
      const toba2Tamegaki = String((toba2TamegakiIdx !== -1 ? row[toba2TamegakiIdx] : '') || '').trim();

      const toba3Val = String((toba3Idx !== -1 ? row[toba3Idx] : '') || '').trim();
      const isToba3 = toba3Val === '申込' || toba3Val === '申込済' || toba3Val === '対象' || toba3Val === '有' || toba3Val === '1' || toba3Val.toLowerCase() === 'true' || (toba3Val.includes('申込') && !toba3Val.includes('未')) || (toba3Val.includes('対象') && !toba3Val.includes('未'));
      const toba3Tamegaki = String((toba3TamegakiIdx !== -1 ? row[toba3TamegakiIdx] : '') || '').trim();

      const rawCDate = fmCDateIdx !== -1 ? row[fmCDateIdx] : '';
      const createdDate = normalizeAuditDate(rawCDate) || '2000/01/01';
      const createdTime = normalizeAuditTime(fmCTimeIdx !== -1 ? row[fmCTimeIdx] : '') || '00:00:00';
      const updatedDate = normalizeAuditDate(fmUDateIdx !== -1 ? row[fmUDateIdx] : '') || createdDate;
      const updatedTime = normalizeAuditTime(fmUTimeIdx !== -1 ? row[fmUTimeIdx] : '') || (fmUDateIdx !== -1 && row[fmUDateIdx] ? '00:00:00' : createdTime);

      const fm: FamilyMember = {
        id: String((fIdIdx !== -1 ? row[fIdIdx] : row[0]) || `FM-${hId}-${i + 1}`),
        householdId: hId,
        name: String(row[resolvedNameIdx] || '').trim(),
        furigana: fFuri || undefined,
        relationship: String(row[resolvedRelIdx] || '').trim(),
        phone: String(row[resolvedPhoneIdx] || '').trim(),
        address: fAddr || undefined,
        isChiefMourner: isChief,
        isSponsor: isChief,
        isSegakiToba: isToba1,
        segakiTamegaki: toba1Tamegaki || undefined,
        toba1Applied: isToba1,
        toba1Tamegaki: toba1Tamegaki || undefined,
        toba2Applied: isToba2,
        toba2Tamegaki: toba2Tamegaki || undefined,
        toba3Applied: isToba3,
        toba3Tamegaki: toba3Tamegaki || undefined,
        notes: String(row[resolvedNotesIdx] || '').trim(),
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
      };
      if (!familyMembersMap.has(hId)) {
        familyMembersMap.set(hId, []);
      }
      familyMembersMap.get(hId)!.push(fm);
    }
  }

  // 4. Parse Households (檀家名簿)
  const householdSheetName = findSheet(['檀家名簿', '檀家一覧', '名簿', '檀家', '世帯名簿']);
  const { headers: householdHeaders, rows: householdValues } = getSheetDataByName(householdSheetName);
  const households: Household[] = [];
  const householdTempleMap = new Map<string, string>();

  if (householdValues.length > 0) {
    const idIdx = findColIdx(householdHeaders, ['ID', '檀家ID', '世帯ID', '管理番号', '番号']);
    const templeLabelIdx = findColIdx(householdHeaders, ['所属寺院', '寺院名', '寺院']);
    const templeIdColIdx = findColIdx(householdHeaders, ['所属寺院ID', '寺院ID', 'templeId']);
    const headIdx = findColIdx(householdHeaders, ['世帯主名', '世帯主', '氏名', '名前', '施主名']);
    const furiIdx = findColIdx(householdHeaders, ['フリガナ', 'ふりがな', 'カナ', '世帯主フリガナ']);
    const zipIdx = findColIdx(householdHeaders, ['郵便番号', '〒', '郵便']);
    const addrIdx = findColIdx(householdHeaders, ['住所', '現住所', '所在地']);
    const phoneIdx = findColIdx(householdHeaders, ['電話番号', '電話', 'TEL', '固定電話']);
    const mobileIdx = findColIdx(householdHeaders, ['携帯番号', '携帯', '携帯電話', '緊急連絡先']);
    const mailIdx = findColIdx(householdHeaders, ['メール', 'メールアドレス', 'E-mail', 'Email']);
    const typeIdx = findColIdx(householdHeaders, ['区分１', '区分1', '檀家区分', '世帯区分', '区分']);
    const statusIdx = findColIdx(householdHeaders, ['区分２', '区分2', '状態区分', 'ステータス', '状態']);
    const distIdx = findColIdx(householdHeaders, ['総代・世話人', '役職・地区', '総代', '世話人', '地区', '役職']);
    const tombIdx = findColIdx(householdHeaders, ['墓地番号', '墓所番号', '墓地', '納骨場所', '区画']);
    const toba1Idx = findColIdx(householdHeaders, ['塔婆申込１', '塔婆申込1', '塔婆１', '塔婆1', '塔婆申込１申込', '施餓鬼塔婆申込', '施餓鬼塔婆', '施餓鬼申込', '施餓鬼', '塔婆申込', 'isSegakiToba', 'toba1Applied']);
    const toba1TamegakiIdx = findColIdx(householdHeaders, ['塔婆申込１為書き', '塔婆申込1為書き', '塔婆１為書き', '塔婆1為書き', '施餓鬼為書き', '為書き', '施餓鬼為書', '為書', 'segakiTamegaki', 'toba1Tamegaki']);
    const toba2Idx = findColIdx(householdHeaders, ['塔婆申込２', '塔婆申込2', '塔婆２', '塔婆2', '塔婆申込２申込', 'toba2Applied']);
    const toba2TamegakiIdx = findColIdx(householdHeaders, ['塔婆申込２為書き', '塔婆申込2為書き', '塔婆２為書き', '塔婆2為書き', 'toba2Tamegaki']);
    const toba3Idx = findColIdx(householdHeaders, ['塔婆申込３', '塔婆申込3', '塔婆３', '塔婆3', '塔婆申込３申込', 'toba3Applied']);
    const toba3TamegakiIdx = findColIdx(householdHeaders, ['塔婆申込３為書き', '塔婆申込3為書き', '塔婆３為書き', '塔婆3為書き', 'toba3Tamegaki']);
    const fee1AmtIdx = findColIdx(householdHeaders, ['集金１金額', '集金1金額', '集金項目１金額', '集金項目1金額', '集金１', '集金1', '集金項目１', '集金項目1', 'fee1Amount', 'fee1']);
    const fee2AmtIdx = findColIdx(householdHeaders, ['集金２金額', '集金2金額', '集金項目２金額', '集金項目2金額', '集金２', '集金2', '集金項目２', '集金項目2', 'fee2Amount', 'fee2']);
    const fee3AmtIdx = findColIdx(householdHeaders, ['集金３金額', '集金3金額', '集金項目３金額', '集金項目3金額', '集金３', '集金3', '集金項目３', '集金項目3', 'fee3Amount', 'fee3']);
    const tanagyoIdx = findColIdx(householdHeaders, ['棚経・月参り対象', '棚経・月参り', '棚経月参り', '棚経対象', '棚経', '月参り', 'tanagyoMonthlyVisit']);
    const tanagyoDateIdx = findColIdx(householdHeaders, ['棚経訪問日', '訪問日', '棚経日', '棚経日程', 'tanagyoDate']);
    const tanagyoTimeSlotIdx = findColIdx(householdHeaders, ['棚経時間帯', '時間帯', '棚経午前午後', 'tanagyoTimeSlot']);
    const tanagyoPriestIdx = findColIdx(householdHeaders, ['棚経担当僧侶', '棚経担当', '担当僧侶', 'tanagyoPriest', 'tanagyoPriestName']);
    const tanagyoOrderIdx = findColIdx(householdHeaders, ['棚経巡回順序', '棚経順序', '巡回順序', '巡回順', 'tanagyoOrder']);
    const tanagyoAddrIdx = findColIdx(householdHeaders, ['棚経伺い先住所', '棚経訪問先住所', '棚経住所', '伺い先住所', 'tanagyoAddress']);
    const tanagyoNotesIdx = findColIdx(householdHeaders, ['棚経訪問特記', '棚経特記', '棚経備考', 'tanagyoNotes']);
    const notesIdx = findColIdx(householdHeaders, ['メモ', '備考', '特記事項']);
    const createdIdx = findColIdx(householdHeaders, ['登録日時', '登録日', '作成日', '作成日時']);
    const hCDateIdx = findColIdx(householdHeaders, ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt']);
    const hCTimeIdx = findColIdx(householdHeaders, ['作成時間', '作成時刻', 'createdTime']);
    const hUDateIdx = findColIdx(householdHeaders, ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt']);
    const hUTimeIdx = findColIdx(householdHeaders, ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime']);

    const defaultTemple = options?.defaultTempleId || (temples && temples[0]?.id) || 'temple-main';

    for (let i = 0; i < householdValues.length; i++) {
      const row = householdValues[i];
      if (!row || row.length === 0 || !row[0]) continue;

      const householdId = String((idIdx !== -1 ? row[idIdx] : row[0]) || `DK-${Date.now()}-${i + 1}`).trim();
      let templeId = defaultTemple;

      if (templeIdColIdx !== -1 && row[templeIdColIdx]) {
        templeId = String(row[templeIdColIdx]).trim();
      } else if (templeLabelIdx !== -1 && row[templeLabelIdx]) {
        const tVal = String(row[templeLabelIdx]).trim();
        for (const [tName, id] of templeNameToIdMap.entries()) {
          if (tVal.includes(tName) || tName.includes(tVal)) {
            templeId = id;
            break;
          }
        }
      }

      const familyHead = String((headIdx !== -1 ? row[headIdx] : row[1]) || '氏名未設定').trim();
      const furigana = normalizeFurigana(furiIdx !== -1 ? row[furiIdx] : row[2]);
      const postalCode = String((zipIdx !== -1 ? row[zipIdx] : '') || '').trim();
      const address = String((addrIdx !== -1 ? row[addrIdx] : '') || '').trim();
      const phone = String((phoneIdx !== -1 ? row[phoneIdx] : '') || '').trim();
      const mobile = String((mobileIdx !== -1 ? row[mobileIdx] : '') || '').trim();
      const email = String((mailIdx !== -1 ? row[mailIdx] : '') || '').trim();
      const householdType = String((typeIdx !== -1 ? row[typeIdx] : '') || '').trim();
      const status = String((statusIdx !== -1 ? row[statusIdx] : '') || '').trim();
      const district = String((distIdx !== -1 ? row[distIdx] : '') || '').trim();
      const tombNumber = String((tombIdx !== -1 ? row[tombIdx] : '') || '').trim();

      const toba1Val = String((toba1Idx !== -1 ? row[toba1Idx] : '') || '').trim();
      const isToba1 = toba1Val === '申込' || toba1Val === '申込済' || toba1Val === '対象' || toba1Val === '有' || toba1Val === '1' || toba1Val.toLowerCase() === 'true' || (toba1Val.includes('申込') && !toba1Val.includes('未')) || (toba1Val.includes('対象') && !toba1Val.includes('未'));
      const toba1Tamegaki = String((toba1TamegakiIdx !== -1 ? row[toba1TamegakiIdx] : '') || '').trim();

      const toba2Val = String((toba2Idx !== -1 ? row[toba2Idx] : '') || '').trim();
      const isToba2 = toba2Val === '申込' || toba2Val === '申込済' || toba2Val === '対象' || toba2Val === '有' || toba2Val === '1' || toba2Val.toLowerCase() === 'true' || (toba2Val.includes('申込') && !toba2Val.includes('未')) || (toba2Val.includes('対象') && !toba2Val.includes('未'));
      const toba2Tamegaki = String((toba2TamegakiIdx !== -1 ? row[toba2TamegakiIdx] : '') || '').trim();

      const toba3Val = String((toba3Idx !== -1 ? row[toba3Idx] : '') || '').trim();
      const isToba3 = toba3Val === '申込' || toba3Val === '申込済' || toba3Val === '対象' || toba3Val === '有' || toba3Val === '1' || toba3Val.toLowerCase() === 'true' || (toba3Val.includes('申込') && !toba3Val.includes('未')) || (toba3Val.includes('対象') && !toba3Val.includes('未'));
      const toba3Tamegaki = String((toba3TamegakiIdx !== -1 ? row[toba3TamegakiIdx] : '') || '').trim();

      const fee1Raw = fee1AmtIdx !== -1 ? row[fee1AmtIdx] : undefined;
      const fee1Amount = fee1Raw !== undefined && fee1Raw !== '' && !isNaN(Number(String(fee1Raw).replace(/[^0-9.-]/g, ''))) ? Number(String(fee1Raw).replace(/[^0-9.-]/g, '')) : undefined;
      const fee2Raw = fee2AmtIdx !== -1 ? row[fee2AmtIdx] : undefined;
      const fee2Amount = fee2Raw !== undefined && fee2Raw !== '' && !isNaN(Number(String(fee2Raw).replace(/[^0-9.-]/g, ''))) ? Number(String(fee2Raw).replace(/[^0-9.-]/g, '')) : undefined;
      const fee3Raw = fee3AmtIdx !== -1 ? row[fee3AmtIdx] : undefined;
      const fee3Amount = fee3Raw !== undefined && fee3Raw !== '' && !isNaN(Number(String(fee3Raw).replace(/[^0-9.-]/g, ''))) ? Number(String(fee3Raw).replace(/[^0-9.-]/g, '')) : undefined;

      const tanagyoVal = String((tanagyoIdx !== -1 ? row[tanagyoIdx] : '') || '').trim();
      const tanagyoMonthlyVisit = tanagyoVal === '対象' || tanagyoVal === '棚経' || tanagyoVal === '月参り' || tanagyoVal === '有' || tanagyoVal === '1' || tanagyoVal.toLowerCase() === 'true' || (tanagyoVal.includes('対象') && !tanagyoVal.includes('未'));
      const tanagyoDate = String((tanagyoDateIdx !== -1 ? row[tanagyoDateIdx] : '') || '').trim();
      const rawSlot = String((tanagyoTimeSlotIdx !== -1 ? row[tanagyoTimeSlotIdx] : '') || '').trim();
      const tanagyoTimeSlot: '午前' | '午後' | '時間未定' | undefined =
        rawSlot === '午前' ? '午前' : rawSlot === '午後' ? '午後' : rawSlot === '時間未定' ? '時間未定' : undefined;
      const tanagyoPriestName = String((tanagyoPriestIdx !== -1 ? row[tanagyoPriestIdx] : '') || '').trim();
      const rawOrder = tanagyoOrderIdx !== -1 ? row[tanagyoOrderIdx] : undefined;
      const tanagyoOrder = rawOrder !== undefined && rawOrder !== '' && !isNaN(Number(rawOrder)) ? Number(rawOrder) : undefined;
      const tanagyoAddress = String((tanagyoAddrIdx !== -1 ? row[tanagyoAddrIdx] : '') || '').trim();
      const tanagyoNotes = String((tanagyoNotesIdx !== -1 ? row[tanagyoNotesIdx] : '') || '').trim();

      const notes = String((notesIdx !== -1 ? row[notesIdx] : '') || '').trim();
      const rawCreated = createdIdx !== -1 ? row[createdIdx] : '';
      const createdAt = normalizeDateInput(rawCreated) || new Date().toISOString().split('T')[0];

      const rawCDate = hCDateIdx !== -1 ? row[hCDateIdx] : rawCreated;
      const createdDate = normalizeAuditDate(rawCDate) || normalizeAuditDate(createdAt) || '2000/01/01';
      const createdTime = normalizeAuditTime(hCTimeIdx !== -1 ? row[hCTimeIdx] : '') || (rawCreated && (rawCreated.includes('T') || rawCreated.includes(' ')) ? normalizeAuditTime(rawCreated) : '00:00:00');
      const updatedDate = normalizeAuditDate(hUDateIdx !== -1 ? row[hUDateIdx] : '') || createdDate;
      const updatedTime = normalizeAuditTime(hUTimeIdx !== -1 ? row[hUTimeIdx] : '') || (hUDateIdx !== -1 && row[hUDateIdx] ? '00:00:00' : createdTime);

      const familyMembers: FamilyMember[] = familyMembersMap.get(householdId) || [];

      householdTempleMap.set(householdId, templeId);

      households.push({
        id: householdId,
        templeId,
        familyHead,
        furigana,
        postalCode,
        address,
        phone,
        mobile,
        email,
        householdType,
        status,
        district,
        tombNumber,
        isSegakiToba: isToba1,
        segakiTamegaki: toba1Tamegaki || undefined,
        toba1Applied: isToba1,
        toba1Tamegaki: toba1Tamegaki || undefined,
        toba2Applied: isToba2,
        toba2Tamegaki: toba2Tamegaki || undefined,
        toba3Applied: isToba3,
        toba3Tamegaki: toba3Tamegaki || undefined,
        fee1Amount: fee1Amount !== undefined ? fee1Amount : undefined,
        fee2Amount: fee2Amount !== undefined ? fee2Amount : undefined,
        fee3Amount: fee3Amount !== undefined ? fee3Amount : undefined,
        fee1: fee1Amount !== undefined ? fee1Amount : undefined,
        fee2: fee2Amount !== undefined ? fee2Amount : undefined,
        fee3: fee3Amount !== undefined ? fee3Amount : undefined,
        tanagyoMonthlyVisit,
        tanagyoDate: tanagyoDate || undefined,
        tanagyoTimeSlot: tanagyoTimeSlot || undefined,
        tanagyoPriestName: tanagyoPriestName || undefined,
        tanagyoOrder: tanagyoOrder !== undefined ? tanagyoOrder : undefined,
        tanagyoAddress: tanagyoAddress || undefined,
        tanagyoNotes: tanagyoNotes || undefined,
        notes,
        qrToken: `QR-${householdId}`,
        createdAt,
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
        familyMembers,
      });
    }
  }

  // 5. Parse Past Records (過去帳)
  const pastSheetName = findSheet(['過去帳', '過去帳一覧', '故人名簿', '物故者名簿', '故人一覧']);
  const { headers: pastHeaders, rows: pastRecordValues } = getSheetDataByName(pastSheetName);
  const pastRecords: PastRecord[] = [];

  if (pastRecordValues.length > 0) {
    const idColIdx = findColIdx(pastHeaders, ['ID', '過去帳ID', 'id', '管理番号', '番号']);
    const templeColIdx = findColIdx(pastHeaders, ['所属寺院', '寺院名', '寺院']);
    const templeIdColIdx = findColIdx(pastHeaders, ['所属寺院ID', '寺院ID', 'templeId']);
    const hIdColIdx = findColIdx(pastHeaders, ['檀家ID (世帯ID)', '世帯ID', '檀家ID', '檀家番号', 'householdId']);
    const dharmaColIdx = findColIdx(pastHeaders, ['戒名・法名', '戒名 / 法名', '戒名', '法名', '法号']);
    const secularColIdx = findColIdx(pastHeaders, ['俗名 (故人名)', '故人名 (俗名)', '俗名', '故人名', '故人氏名', '本名', '氏名']);
    const furiColIdx = findColIdx(pastHeaders, ['フリガナ', 'ふりがな', '俗名フリガナ', '故人フリガナ', 'カナ']);
    const deathDateColIdx = findColIdx(pastHeaders, ['命日 (没年月日)', '命日', '没年月日', '死亡日', '逝去日']);
    const ageColIdx = findColIdx(pastHeaders, ['享年 (行年)', '享年 / 行年', '享年', '行年', '没年齢', '年齢']);
    const relColIdx = findColIdx(pastHeaders, ['続柄', '続柄 / 関係', '関係']);
    const headNameColIdx = findColIdx(pastHeaders, ['施主名 (現世帯主等)', '施主・世帯主名', '当時の施主名', '施主名', '世帯主名', '施主', '現世帯主']);
    const burialColIdx = findColIdx(pastHeaders, ['墓地番号', '納骨・墓地位置', '墓所', '納骨位置', '墓地']);
    const niibonColIdx = findColIdx(pastHeaders, ['新盆区分', '新盆', '初盆']);
    const notesColIdx = findColIdx(pastHeaders, ['備考・行状', '備考', 'メモ', '特記', '過去帳備考']);
    const prCDateIdx = findColIdx(pastHeaders, ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt']);
    const prCTimeIdx = findColIdx(pastHeaders, ['作成時間', '作成時刻', 'createdTime']);
    const prUDateIdx = findColIdx(pastHeaders, ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt']);
    const prUTimeIdx = findColIdx(pastHeaders, ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime']);

    for (let i = 0; i < pastRecordValues.length; i++) {
      const row = pastRecordValues[i];
      if (!row || row.length === 0 || (!row[0] && dharmaColIdx === -1 && secularColIdx === -1)) continue;

      const dharmaName = String((dharmaColIdx !== -1 ? row[dharmaColIdx] : '') || '').trim();
      const secularName = String((secularColIdx !== -1 ? row[secularColIdx] : '') || '').trim();
      if (!dharmaName && !secularName && (!row[0] || row[0] === '')) continue;

      const householdId = String((hIdColIdx !== -1 ? row[hIdColIdx] : '') || '').trim();
      let templeId = (householdId && householdTempleMap.get(householdId)) || options?.defaultTempleId || 'temple-main';

      if (templeIdColIdx !== -1 && row[templeIdColIdx]) {
        templeId = String(row[templeIdColIdx]).trim();
      } else if (templeColIdx !== -1 && row[templeColIdx]) {
        const tVal = String(row[templeColIdx]).trim();
        for (const [tName, id] of templeNameToIdMap.entries()) {
          if (tVal.includes(tName) || tName.includes(tVal)) {
            templeId = id;
            break;
          }
        }
      }

      const furigana = normalizeFurigana(furiColIdx !== -1 ? row[furiColIdx] : '');
      const deathDate = normalizeDateInput(deathDateColIdx !== -1 ? row[deathDateColIdx] : '') || '';
      const ageStr = String((ageColIdx !== -1 ? row[ageColIdx] : '') || '').replace(/[^0-9]/g, '');
      const ageAtDeath = ageStr ? parseInt(ageStr, 10) : undefined;
      const relationship = String((relColIdx !== -1 ? row[relColIdx] : '') || '').trim();
      const headName = String((headNameColIdx !== -1 ? row[headNameColIdx] : '') || '').trim();
      const burialLocation = String((burialColIdx !== -1 ? row[burialColIdx] : '') || '').trim();
      const niibonVal = String((niibonColIdx !== -1 ? row[niibonColIdx] : '') || '').trim();
      const notesVal = String((notesColIdx !== -1 ? row[notesColIdx] : '') || '').trim();

      const recordId = String((idColIdx !== -1 ? row[idColIdx] : row[0]) || `PR-${Date.now()}-${i + 1}`).trim();

      const rawCDate = prCDateIdx !== -1 ? row[prCDateIdx] : '';
      const createdDate = normalizeAuditDate(rawCDate) || '2000/01/01';
      const createdTime = normalizeAuditTime(prCTimeIdx !== -1 ? row[prCTimeIdx] : '') || '00:00:00';
      const updatedDate = normalizeAuditDate(prUDateIdx !== -1 ? row[prUDateIdx] : '') || createdDate;
      const updatedTime = normalizeAuditTime(prUTimeIdx !== -1 ? row[prUTimeIdx] : '') || (prUDateIdx !== -1 && row[prUDateIdx] ? '00:00:00' : createdTime);

      pastRecords.push({
        id: recordId,
        templeId,
        householdId,
        householdHeadName: headName,
        dharmaName,
        secularName,
        deceasedName: secularName,
        furigana,
        deathDate,
        ageAtDeath,
        age: ageAtDeath,
        relationship,
        chiefMourner: headName,
        burialLocation,
        tombNumber: burialLocation,
        niibon: niibonVal || undefined,
        notes: notesVal,
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
      });
    }
  }

  // 6. Parse Memorial Services (法事予約 / 法事・予約一覧)
  const memorialSheetName = findSheet(['法事予約', '法事・予約一覧', '法事', '法要予約', '予約一覧', '予約']);
  const { headers: memorialHeaders, rows: memorialValues } = getSheetDataByName(memorialSheetName);
  const memorialServices: MemorialService[] = [];

  if (memorialValues.length > 0) {
    const idIdx = findColIdx(memorialHeaders, ['予約ID', 'ID', 'id', '管理番号']);
    const templeColIdx = findColIdx(memorialHeaders, ['所属寺院', '寺院名', '寺院']);
    const templeIdColIdx = findColIdx(memorialHeaders, ['所属寺院ID', '寺院ID', 'templeId']);
    const dateIdx = findColIdx(memorialHeaders, ['予定日', '法要日', '日付', '実施日']);
    const timeIdx = findColIdx(memorialHeaders, ['開始時刻', '予定時刻', '時刻', '時間']);
    const endTimeIdx = findColIdx(memorialHeaders, ['終了時刻', '終了時間']);
    const typeIdx = findColIdx(memorialHeaders, ['種別・回忌', '法要種別', '種別', '回忌', '年忌']);
    const mournerIdx = findColIdx(memorialHeaders, ['施主名', '施主', '申込者']);
    const dharmaIdx = findColIdx(memorialHeaders, ['戒名・法名', '戒名', '法名']);
    const decIdx = findColIdx(memorialHeaders, ['俗名 (故人名)', '故人名', '俗名']);
    const venueIdx = findColIdx(memorialHeaders, ['会場', '場所']);
    const addrIdx = findColIdx(memorialHeaders, ['訪問先住所', '住所', '会場住所']);
    const attIdx = findColIdx(memorialHeaders, ['参列予定人数', '参列人数', '人数']);
    const offIdx = findColIdx(memorialHeaders, ['布施金額', 'お布施', '布施']);
    const tobaCntIdx = findColIdx(memorialHeaders, ['塔婆本数', '塔婆数']);
    const tobaTypeIdx = findColIdx(memorialHeaders, ['塔婆種別', '塔婆タイプ']);
    const tobaFeeIdx = findColIdx(memorialHeaders, ['塔婆料', '塔婆金額']);
    const tobaSponsorIdx = findColIdx(memorialHeaders, ['塔婆志主', '塔婆施主', '志主']);
    const statusIdx = findColIdx(memorialHeaders, ['進捗状況', '案内状況', '状況']);
    const recIdx = findColIdx(memorialHeaders, ['受付状況', 'チェックイン', '受付']);
    const accIdx = findColIdx(memorialHeaders, ['会計記帳状況', '記帳状況', '会計']);
    const hIdIdx = findColIdx(memorialHeaders, ['世帯ID', '檀家ID']);
    const decIdIdx = findColIdx(memorialHeaders, ['過去帳ID', '故人ID', '物故者ID']);
    const txIdIdx = findColIdx(memorialHeaders, ['出納伝票ID', '伝票ID']);
    const notesIdx = findColIdx(memorialHeaders, ['備考・特記', '備考', '特記', 'メモ']);
    const msCDateIdx = findColIdx(memorialHeaders, ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt']);
    const msCTimeIdx = findColIdx(memorialHeaders, ['作成時間', '作成時刻', 'createdTime']);
    const msUDateIdx = findColIdx(memorialHeaders, ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt']);
    const msUTimeIdx = findColIdx(memorialHeaders, ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime']);

    for (let i = 0; i < memorialValues.length; i++) {
      const row = memorialValues[i];
      if (!row || row.length === 0 || !row[0]) continue;

      const householdId = String((hIdIdx !== -1 ? row[hIdIdx] : '') || '').trim();
      let templeId = (householdId && householdTempleMap.get(householdId)) || options?.defaultTempleId || 'temple-main';

      if (templeIdColIdx !== -1 && row[templeIdColIdx]) {
        templeId = String(row[templeIdColIdx]).trim();
      } else if (templeColIdx !== -1 && row[templeColIdx]) {
        const tVal = String(row[templeColIdx]).trim();
        for (const [tName, id] of templeNameToIdMap.entries()) {
          if (tVal.includes(tName) || tName.includes(tVal)) {
            templeId = id;
            break;
          }
        }
      }

      const tobaSponsorsStr = String((tobaSponsorIdx !== -1 ? row[tobaSponsorIdx] : '') || '');
      const tobaSponsors = tobaSponsorsStr ? tobaSponsorsStr.split(/[、,・]/).map((s) => s.trim()).filter(Boolean) : [];

      const rawCDate = msCDateIdx !== -1 ? row[msCDateIdx] : '';
      const createdDate = normalizeAuditDate(rawCDate) || '2000/01/01';
      const createdTime = normalizeAuditTime(msCTimeIdx !== -1 ? row[msCTimeIdx] : '') || '00:00:00';
      const updatedDate = normalizeAuditDate(msUDateIdx !== -1 ? row[msUDateIdx] : '') || createdDate;
      const updatedTime = normalizeAuditTime(msUTimeIdx !== -1 ? row[msUTimeIdx] : '') || (msUDateIdx !== -1 && row[msUDateIdx] ? '00:00:00' : createdTime);

      memorialServices.push({
        id: String((idIdx !== -1 ? row[idIdx] : row[0]) || `MS-${Date.now()}-${i + 1}`),
        templeId,
        scheduledDate: normalizeDateInput(dateIdx !== -1 ? row[dateIdx] : '') || '',
        scheduledTime: String((timeIdx !== -1 ? row[timeIdx] : '') || '10:00'),
        endTime: String((endTimeIdx !== -1 ? row[endTimeIdx] : '') || '11:30'),
        memorialType: (String((typeIdx !== -1 ? row[typeIdx] : '') || '年忌法要') as any),
        chiefMourner: String((mournerIdx !== -1 ? row[mournerIdx] : '') || ''),
        dharmaName: String((dharmaIdx !== -1 ? row[dharmaIdx] : '') || ''),
        deceasedName: String((decIdx !== -1 ? row[decIdx] : '') || ''),
        venue: String((venueIdx !== -1 ? row[venueIdx] : '') || '本堂'),
        address: String((addrIdx !== -1 ? row[addrIdx] : '') || ''),
        attendeeCount: parseInt(String((attIdx !== -1 ? row[attIdx] : '0')), 10) || 0,
        offeringAmount: parseInt(String((offIdx !== -1 ? row[offIdx] : '0')), 10) || 0,
        tobaCount: parseInt(String((tobaCntIdx !== -1 ? row[tobaCntIdx] : '0')), 10) || 0,
        tobaType: String((tobaTypeIdx !== -1 ? row[tobaTypeIdx] : '') || '大塔婆'),
        tobaFee: parseInt(String((tobaFeeIdx !== -1 ? row[tobaFeeIdx] : '0')), 10) || 0,
        tobaSponsors,
        status: (String((statusIdx !== -1 ? row[statusIdx] : '') || '未入金') as any),
        receptionCheckedIn: String(recIdx !== -1 ? row[recIdx] : '').includes('済'),
        accountingRecorded: String(accIdx !== -1 ? row[accIdx] : '').includes('済'),
        householdId,
        deceasedId: String((decIdIdx !== -1 ? row[decIdIdx] : '') || ''),
        transactionId: String((txIdIdx !== -1 ? row[txIdIdx] : '') || ''),
        notes: String((notesIdx !== -1 ? row[notesIdx] : '') || ''),
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
      });
    }
  }

  // 7. Parse Temple Todos (寺院ToDo / 寺院タスク・ToDo)
  const todoSheetName = findSheet(['寺院ToDo', '寺院タスク・ToDo', '寺院タスク', 'ToDo', 'タスク', 'ToDo一覧', 'task']);
  const { headers: todoHeaders, rows: todoValues } = getSheetDataByName(todoSheetName);
  const templeTodos: TempleTodo[] = [];

  if (todoValues.length > 0) {
    const idColIdx = findColIdx(todoHeaders, ['ToDo-ID', 'タスクID', 'ID', 'id', 'No']);
    const templeColIdx = findColIdx(todoHeaders, ['所属寺院', '寺院名', '寺院']);
    const templeIdColIdx = findColIdx(todoHeaders, ['所属寺院ID', '寺院ID', 'templeId']);
    const dateColIdx = findColIdx(todoHeaders, ['期日', '予定日', '日付', '期限', 'dueDate']);
    const timeColIdx = findColIdx(todoHeaders, ['予定時刻', '時刻', '時間', 'dueTime']);
    const titleColIdx = findColIdx(todoHeaders, ['タスク・行事名', 'タスク内容', 'タスク名', '内容', 'タイトル', '件名', 'title']);
    const catColIdx = findColIdx(todoHeaders, ['区分カテゴリ', '区分・カテゴリ', '区分', 'カテゴリ', '種別', 'category']);
    const priorityColIdx = findColIdx(todoHeaders, ['重要度', '優先度', 'priority']);
    const statusColIdx = findColIdx(todoHeaders, ['完了状況', '完了状態', '状態', '完了', 'ステータス', 'completed', '進捗']);
    const headNameColIdx = findColIdx(todoHeaders, ['関連施主名', '施主・世帯主名', '施主名', '世帯主名', '施主', '世帯主', '氏名']);
    const hIdColIdx = findColIdx(todoHeaders, ['世帯ID', '檀家ID', 'householdId']);
    const serviceIdColIdx = findColIdx(todoHeaders, ['法事予約ID', '関連法要ID', '予約ID', '法要ID', 'relatedServiceId', 'serviceId']);
    const notesColIdx = findColIdx(todoHeaders, ['備考メモ', '備考・特記', '備考', '特記', 'メモ', 'notes']);
    const createdColIdx = findColIdx(todoHeaders, ['作成日時', '登録日', '作成日', 'createdAt']);
    const tdCDateIdx = findColIdx(todoHeaders, ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt']);
    const tdCTimeIdx = findColIdx(todoHeaders, ['作成時間', '作成時刻', 'createdTime']);
    const tdUDateIdx = findColIdx(todoHeaders, ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt']);
    const tdUTimeIdx = findColIdx(todoHeaders, ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime']);

    for (let i = 0; i < todoValues.length; i++) {
      const row = todoValues[i];
      if (!row || row.length === 0 || !row[0]) continue;

      const title = String((titleColIdx !== -1 ? row[titleColIdx] : '') || '').trim();
      const dueDate = normalizeDateInput(dateColIdx !== -1 ? row[dateColIdx] : '') || new Date().toISOString().split('T')[0];
      if (!title && !dueDate) continue;

      const householdId = String((hIdColIdx !== -1 ? row[hIdColIdx] : '') || '').trim();
      const serviceId = String((serviceIdColIdx !== -1 ? row[serviceIdColIdx] : '') || '').trim();

      let templeId = (householdId && householdTempleMap.get(householdId)) || options?.defaultTempleId || 'temple-main';
      if (templeIdColIdx !== -1 && row[templeIdColIdx]) {
        templeId = String(row[templeIdColIdx]).trim();
      } else if (templeColIdx !== -1 && row[templeColIdx]) {
        const tVal = String(row[templeColIdx]).trim();
        for (const [tName, id] of templeNameToIdMap.entries()) {
          if (tVal.includes(tName) || tName.includes(tVal)) {
            templeId = id;
            break;
          }
        }
      }

      const priorityStr = String((priorityColIdx !== -1 ? row[priorityColIdx] : '') || '');
      const priority: 'urgent' | 'high' | 'medium' | 'low' = 
        priorityStr.includes('至急') ? 'urgent' : priorityStr.includes('高') ? 'high' : priorityStr.includes('低') ? 'low' : 'medium';
      const statusVal = String((statusColIdx !== -1 ? row[statusColIdx] : '') || '').trim();
      const isCompleted = statusVal === '完了' || statusVal === '済' || statusVal === '完了済' || statusVal === '1' || statusVal.toLowerCase() === 'true' || (statusVal.includes('完了') && !statusVal.includes('未完了') && !statusVal.includes('未'));

      const rawCreated = createdColIdx !== -1 ? row[createdColIdx] : '';
      const createdAt = normalizeDateInput(rawCreated) || new Date().toISOString().split('T')[0];

      const rawCDate = tdCDateIdx !== -1 ? row[tdCDateIdx] : rawCreated;
      const createdDate = normalizeAuditDate(rawCDate) || '2000/01/01';
      const createdTime = normalizeAuditTime(tdCTimeIdx !== -1 ? row[tdCTimeIdx] : '') || (rawCreated && (rawCreated.includes('T') || rawCreated.includes(' ')) ? normalizeAuditTime(rawCreated) : '00:00:00');
      const updatedDate = normalizeAuditDate(tdUDateIdx !== -1 ? row[tdUDateIdx] : '') || createdDate;
      const updatedTime = normalizeAuditTime(tdUTimeIdx !== -1 ? row[tdUTimeIdx] : '') || (tdUDateIdx !== -1 && row[tdUDateIdx] ? '00:00:00' : createdTime);

      templeTodos.push({
        id: String((idColIdx !== -1 ? row[idColIdx] : row[0]) || `TD-${Date.now()}-${i + 1}`),
        templeId,
        dueDate,
        dueTime: String((timeColIdx !== -1 ? row[timeColIdx] : '') || '17:00'),
        title: title || '無題のタスク',
        category: (String((catColIdx !== -1 ? row[catColIdx] : '') || '法事') as TodoCategory),
        priority,
        completed: isCompleted,
        householdHeadName: String((headNameColIdx !== -1 ? row[headNameColIdx] : '') || ''),
        contactName: String((headNameColIdx !== -1 ? row[headNameColIdx] : '') || ''),
        householdId,
        serviceId,
        relatedServiceId: serviceId,
        notes: String((notesColIdx !== -1 ? row[notesColIdx] : '') || ''),
        createdAt,
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
      });
    }
  }

  // 8. Parse Transactions (出納・会計)
  const txSheetName = findSheet(['出納・会計', '出納帳', '会計', '出納', '会計管理', '取引履歴']);
  const { headers: txHeaders, rows: transactionValues } = getSheetDataByName(txSheetName);
  const transactions: Transaction[] = [];

  if (transactionValues.length > 0) {
    const idIdx = findColIdx(txHeaders, ['伝票ID', 'ID', 'id', '伝票番号', '番号']);
    const templeColIdx = findColIdx(txHeaders, ['所属寺院', '寺院名', '寺院']);
    const templeIdColIdx = findColIdx(txHeaders, ['所属寺院ID', '寺院ID', 'templeId']);
    const dateIdx = findColIdx(txHeaders, ['日付', '取引日', '年月日']);
    const typeIdx = findColIdx(txHeaders, ['収支区分', '区分', '種別', '収支']);
    const catIdx = findColIdx(txHeaders, ['勘定科目', '科目', '科目名']);
    const amtIdx = findColIdx(txHeaders, ['金額', '取引金額', '収支金額']);
    const nameIdx = findColIdx(txHeaders, ['施主・支払者名', '施主名', '支払者', '相手先', '世帯主名']);
    const payIdx = findColIdx(txHeaders, ['支払方法', '受取方法', '決済方法']);
    const receiptIdx = findColIdx(txHeaders, ['領収書番号', '領収書No', 'レシート番号']);
    const hIdIdx = findColIdx(txHeaders, ['世帯ID', '檀家ID', 'householdId']);
    const notesIdx = findColIdx(txHeaders, ['備考', 'メモ', '摘要', '特記']);
    const txCDateIdx = findColIdx(txHeaders, ['作成日', '作成年月日', '登録日', 'createdDate', 'createdAt']);
    const txCTimeIdx = findColIdx(txHeaders, ['作成時間', '作成時刻', 'createdTime']);
    const txUDateIdx = findColIdx(txHeaders, ['修正日', '更新日', '修正年月日', '更新年月日', 'updatedDate', 'updatedAt']);
    const txUTimeIdx = findColIdx(txHeaders, ['修正時間', '更新時間', '修正時刻', '更新時刻', 'updatedTime']);

    for (let i = 0; i < transactionValues.length; i++) {
      const row = transactionValues[i];
      if (!row || row.length === 0 || !row[0]) continue;

      const householdId = String((hIdIdx !== -1 ? row[hIdIdx] : '') || '').trim();
      let templeId = (householdId && householdTempleMap.get(householdId)) || options?.defaultTempleId || 'temple-main';

      if (templeIdColIdx !== -1 && row[templeIdColIdx]) {
        templeId = String(row[templeIdColIdx]).trim();
      } else if (templeColIdx !== -1 && row[templeColIdx]) {
        const tVal = String(row[templeColIdx]).trim();
        for (const [tName, id] of templeNameToIdMap.entries()) {
          if (tVal.includes(tName) || tName.includes(tVal)) {
            templeId = id;
            break;
          }
        }
      }

      const rawCDate = txCDateIdx !== -1 ? row[txCDateIdx] : '';
      const createdDate = normalizeAuditDate(rawCDate) || '2000/01/01';
      const createdTime = normalizeAuditTime(txCTimeIdx !== -1 ? row[txCTimeIdx] : '') || '00:00:00';
      const updatedDate = normalizeAuditDate(txUDateIdx !== -1 ? row[txUDateIdx] : '') || createdDate;
      const updatedTime = normalizeAuditTime(txUTimeIdx !== -1 ? row[txUTimeIdx] : '') || (txUDateIdx !== -1 && row[txUDateIdx] ? '00:00:00' : createdTime);

      transactions.push({
        id: String((idIdx !== -1 ? row[idIdx] : row[0]) || `TX-${Date.now()}-${i + 1}`),
        templeId,
        date: normalizeDateInput(dateIdx !== -1 ? row[dateIdx] : '') || new Date().toISOString().split('T')[0],
        type: ((typeIdx !== -1 ? row[typeIdx] : '収入') as '収入' | '支出') || '収入',
        category: String((catIdx !== -1 ? row[catIdx] : '') || '法要布施'),
        amount: parseInt(String((amtIdx !== -1 ? row[amtIdx] : '0')).replace(/[^0-9-]/g, ''), 10) || 0,
        householdHeadName: String((nameIdx !== -1 ? row[nameIdx] : '') || ''),
        paymentMethod: (String((payIdx !== -1 ? row[payIdx] : '') || '現金受付') as any),
        receiptNumber: String((receiptIdx !== -1 ? row[receiptIdx] : '') || ''),
        householdId,
        notes: String((notesIdx !== -1 ? row[notesIdx] : '') || ''),
        createdDate,
        createdTime,
        updatedDate,
        updatedTime,
      });
    }
  }

  // 9. Parse Master Options (マスタ設定（総合） / マスタ設定 & Per-temple master sheets)
  const parseMasterFromRows = (headers: string[], rows: string[][]): MasterOptions | undefined => {
    if (!rows || rows.length === 0) return undefined;
    const householdTypes: string[] = [];
    const statuses: string[] = [];
    const districts: string[] = [];
    const incomeCategories: string[] = [];
    const expenseCategories: string[] = [];
    const paymentMethods: string[] = [];

    const hTypeIdx = findColIdx(headers, ['区分１', '区分1', '檀家種別', '世帯区分', '区分']);
    const statusIdx = findColIdx(headers, ['区分２', '区分2', '状態区分', 'ステータス', '状態']);
    const districtIdx = findColIdx(headers, ['総代・世話人', '役職', '地区', '総代', '世話人']);
    const incIdx = findColIdx(headers, ['収入の部 (勘定科目)', '勘定科目（収入）', '勘定科目(収入)', '収入の部', '収入科目', '収入科目名', '収入']);
    const expIdx = findColIdx(headers, ['支出の部 (勘定科目)', '勘定科目（支出）', '勘定科目(支出)', '支出の部', '支出科目', '支出科目名', '支出']);
    const payIdx = findColIdx(headers, ['決済方法', '支払・受取方法', '受取方法', '支払方法', '決済']);

    rows.forEach((row) => {
      const hType = String((hTypeIdx !== -1 ? row[hTypeIdx] : row[0]) || '').trim();
      const st = String((statusIdx !== -1 ? row[statusIdx] : row[1]) || '').trim();
      const dist = String((districtIdx !== -1 ? row[districtIdx] : row[2]) || '').trim();
      const inc = String((incIdx !== -1 ? row[incIdx] : row[3]) || '').trim();
      const exp = String((expIdx !== -1 ? row[expIdx] : row[4]) || '').trim();
      const pay = String((payIdx !== -1 ? row[payIdx] : row[5]) || '').trim();

      if (hType && !householdTypes.includes(hType)) householdTypes.push(hType);
      if (st && !statuses.includes(st)) statuses.push(st);
      if (dist && !districts.includes(dist)) districts.push(dist);
      if (inc && !incomeCategories.includes(inc)) incomeCategories.push(inc);
      if (exp && !expenseCategories.includes(exp)) expenseCategories.push(exp);
      if (pay && !paymentMethods.includes(pay)) paymentMethods.push(pay);
    });

    const incList = incomeCategories.length > 0 ? incomeCategories : (INITIAL_MASTER_OPTIONS.incomeCategories || []);
    const expList = expenseCategories.length > 0 ? expenseCategories : (INITIAL_MASTER_OPTIONS.expenseCategories || []);

    return {
      householdTypes: householdTypes.length > 0 ? householdTypes : INITIAL_MASTER_OPTIONS.householdTypes,
      statuses: statuses, // Respect empty statuses if cleared by user
      districts: districts.length > 0 ? districts : INITIAL_MASTER_OPTIONS.districts,
      incomeCategories: incList,
      expenseCategories: expList,
      accountingCategories: [...incList, ...expList.filter((c) => !incList.includes(c))],
      paymentMethods: paymentMethods.length > 0 ? paymentMethods : INITIAL_MASTER_OPTIONS.paymentMethods,
    };
  };

  const masterSheetName = findSheet(['マスタ設定（総合）', 'マスタ設定', 'マスタ', 'マスター', '設定']);
  const { headers: masterHeaders, rows: masterRows } = getSheetDataByName(masterSheetName);
  let masterOptions: MasterOptions | undefined = parseMasterFromRows(masterHeaders, masterRows);

  // Check per-temple master sheets (e.g., マスタ_圓福寺, マスタ_宝蔵寺)
  const templeMasterOptionsMap: Record<string, MasterOptions> = {};
  allSheetNames.forEach((sheetName) => {
    if (sheetName.startsWith('マスタ_') || sheetName.startsWith('マスター_')) {
      const tName = sheetName.replace(/^マスタ[ー]?_/, '').trim();
      const { headers: tHeaders, rows: tRows } = getSheetDataByName(sheetName);
      const parsed = parseMasterFromRows(tHeaders, tRows);
      if (parsed) {
        let matchedId = 'temple-main';
        for (const [name, id] of templeNameToIdMap.entries()) {
          if (tName.includes(name) || name.includes(tName)) {
            matchedId = id;
            break;
          }
        }
        templeMasterOptionsMap[matchedId] = parsed;
      }
    }
  });

  if (!masterOptions) {
    const mainKey = Object.keys(templeMasterOptionsMap)[0];
    masterOptions = templeMasterOptionsMap['temple-main'] || (mainKey ? templeMasterOptionsMap[mainKey] : undefined);
  }

  // 10. Parse Notice Templates (案内文テンプレート)
  const templateSheetName = findSheet(['案内文テンプレート', '案内文', 'テンプレート']);
  const { headers: templateHeaders, rows: templateRows } = getSheetDataByName(templateSheetName);
  let noticeTemplates: { higan: string; niibon: string } | undefined;

  if (templateRows.length > 0) {
    const idIdx = findColIdx(templateHeaders, ['テンプレートID', 'ID', 'id']);
    const nameIdx = findColIdx(templateHeaders, ['テンプレート名称', 'テンプレート名', '名称', 'name']);
    const typeIdx = findColIdx(templateHeaders, ['用紙種別', '用紙種類', '用紙', '種別', 'type']);
    const catIdx = findColIdx(templateHeaders, ['法要区分', 'テンプレート区分', '区分', 'category']);
    const contentIdx = findColIdx(templateHeaders, ['案内文本文', '本文', '案内文', '内容', 'content']);

    const isNewFormat = typeIdx !== -1 || (templateHeaders.length >= 4 && contentIdx !== -1);

    if (isNewFormat) {
      const importedTemplates: NoticeTemplateItem[] = [];
      templateRows.forEach((row, i) => {
        if (!row || row.length === 0) return;
        const rawContent = String((contentIdx !== -1 ? row[contentIdx] : row[4]) || '').trim();
        if (!rawContent) return;

        const rawId = String((idIdx !== -1 ? row[idIdx] : row[0]) || `tpl-imported-${Date.now()}-${i}`).trim();
        const rawName = String((nameIdx !== -1 ? row[nameIdx] : row[1]) || `案内文 ${i + 1}`).trim();
        const rawType = String((typeIdx !== -1 ? row[typeIdx] : row[2]) || '').trim();
        const rawCat = String((catIdx !== -1 ? row[catIdx] : row[3]) || '').trim();

        const docType: 'postcard' | 'a4' = rawType.includes('A4') || rawType.toLowerCase().includes('a4') ? 'a4' : 'postcard';
        let category: string = 'custom';
        if (rawCat.includes('彼岸')) category = 'higan';
        else if (rawCat.includes('新盆') || rawCat.includes('初盆')) category = 'niibon';
        else if (rawCat.includes('年回忌') || rawCat.includes('年忌')) category = 'memorial';
        else if (rawCat.includes('年中行事') || rawCat.includes('一般')) category = 'general';

        importedTemplates.push({
          id: rawId,
          name: rawName,
          type: docType,
          category,
          content: rawContent,
          isDefault: i < 4,
        });
      });

      if (importedTemplates.length > 0) {
        saveAllNoticeTemplates(importedTemplates);
        const higanTpl = importedTemplates.find((t) => t.category === 'higan');
        const niibonTpl = importedTemplates.find((t) => t.category === 'niibon');
        noticeTemplates = {
          higan: higanTpl?.content || DEFAULT_HIGAN_TEMPLATE,
          niibon: niibonTpl?.content || DEFAULT_NIIBON_TEMPLATE,
        };
      }
    } else {
      // Legacy 2-column format: [テンプレート区分, 案内文本文]
      let higan = '';
      let niibon = '';
      templateRows.forEach((row) => {
        const type = String(row[0] || '').trim();
        const content = String(row[1] || '').trim();
        if (type.includes('彼岸')) {
          higan = content;
        } else if (type.includes('新盆') || type.includes('初盆')) {
          niibon = content;
        }
      });

      if (higan || niibon) {
        const currentSaved = getSavedNoticeTemplates();
        noticeTemplates = {
          higan: higan || currentSaved.higan,
          niibon: niibon || currentSaved.niibon,
        };
        saveNoticeTemplates(noticeTemplates);
      }
    }
  }

  // 11. Parse Priests (登録僧侶一覧)
  const priestSheetName = findSheet(
    ['登録僧侶一覧', '登録僧侶', '僧侶一覧', '僧侶名簿', '僧侶']
  );
  const { headers: priestHeaders, rows: priestRows } = getSheetDataByName(priestSheetName);
  const parsedPriests: Priest[] = [];

  if (priestRows.length > 0) {
    const idIdx = findColIdx(priestHeaders, ['僧侶ID', 'ID', 'priestid']);
    const nameIdx = findColIdx(priestHeaders, ['僧侶名', '氏名', '名前', '僧名', 'name']);
    const furiIdx = findColIdx(priestHeaders, ['フリガナ', 'ふりがな', 'カナ', 'furigana']);
    const roleIdx = findColIdx(priestHeaders, ['役職・区分', '役職', '区分', '立場', 'role']);
    const templeNameIdx = findColIdx(priestHeaders, ['所属寺院名', '寺院名', '所属']);
    const phoneIdx = findColIdx(priestHeaders, ['電話番号', '電話', '連絡先', 'phone', 'tel']);
    const emailIdx = findColIdx(priestHeaders, ['メールアドレス', 'メール', 'email']);
    const notesIdx = findColIdx(priestHeaders, ['備考・特記', '備考', '特記', 'メモ', 'notes']);
    const autoIdx = findColIdx(priestHeaders, ['自動連携区分', '自動連携', '連携']);
    const templeIdIdx = findColIdx(priestHeaders, ['所属寺院ID', '寺院ID', 'templeid']);

    priestRows.forEach((row, idx) => {
      const name = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
      if (!name) return;

      const id = idIdx !== -1 && row[idIdx] ? String(row[idIdx]).trim() : `priest-sheet-${Date.now()}-${idx}`;
      const furigana = furiIdx !== -1 ? normalizeFurigana(String(row[furiIdx] || '')) : '';
      const role = roleIdx !== -1 && row[roleIdx] ? String(row[roleIdx]).trim() : '僧侶';
      const templeName = templeNameIdx !== -1 ? String(row[templeNameIdx] || '').trim() : '';
      const phone = phoneIdx !== -1 ? String(row[phoneIdx] || '').trim() : '';
      const email = emailIdx !== -1 ? String(row[emailIdx] || '').trim() : '';
      const notes = notesIdx !== -1 ? String(row[notesIdx] || '').trim() : '';
      const autoStr = autoIdx !== -1 ? String(row[autoIdx] || '').trim() : '';
      const rawTempleId = templeIdIdx !== -1 ? String(row[templeIdIdx] || '').trim() : '';

      parsedPriests.push({
        id,
        name,
        furigana,
        role,
        templeId: rawTempleId || (temples && temples[0]?.id ? temples[0].id : 'temple-main'),
        templeName: templeName || temples?.find((t) => t.id === rawTempleId)?.name || '',
        phone,
        email,
        notes,
        isAutoChief: autoStr.includes('自動') || role.includes('住職'),
        isMainChief: role.includes('本寺住職'),
      });
    });
  }

  // 12. Parse Operation & Deletion History (操作・削除履歴)
  const parsedDeletedRecords: DeletedRecordEntry[] = [];
  const deletedSheetName = findSheet(['操作・削除履歴', '削除履歴', '操作履歴', '削除ログ']);
  const { headers: dHeaders, rows: dRows } = getSheetDataByName(deletedSheetName);
  if (dRows && dRows.length > 0) {
    const actionTypeIdx = findColIdx(dHeaders, ['操作種別', '種別', 'アクション', 'actionType']);
    const entityTypeIdx = findColIdx(dHeaders, ['対象エンティティ', 'データ種別', 'エンティティ', '対象種別', '対象', 'entityType']);
    const idIdx = findColIdx(dHeaders, ['対象ID', 'レコードID', 'ID', 'id']);
    const labelIdx = findColIdx(dHeaders, ['対象名称/内容', '対象名称内容', '名称・内容', '名称', '内容', 'ラベル', '説明', 'label']);
    const deletedAtIdx = findColIdx(dHeaders, ['削除・操作日時', '削除操作日時', '日時', '削除日時', 'deletedAt']);
    const timestampIdx = findColIdx(dHeaders, ['日時(ms)', 'タイムスタンプ(ms)', 'タイムスタンプms', '日時(ミリ秒)', 'タイムスタンプ', 'ms', 'timestamp']);
    const dTempleIdIdx = findColIdx(dHeaders, ['所属寺院ID', '寺院ID', 'templeId']);

    dRows.forEach((row: string[]) => {
      // row indices fallback: [0:履歴ID, 1:種別, 2:対象エンティティ, 3:対象ID, 4:対象名称/内容, 5:削除・操作日時, 6:日時(ms), 7:所属寺院, 8:所属寺院ID]
      const id = String((idIdx !== -1 ? row[idIdx] : (row[3] || row[2])) || '').trim();
      if (!id || id.startsWith('DEL-') || id === 'ID' || id === '対象ID') return;
      const entityType = (entityTypeIdx !== -1 ? String(row[entityTypeIdx] || '').trim() : (row[2] || 'household')) as any;
      const actionType = (actionTypeIdx !== -1 ? String(row[actionTypeIdx] || '').trim() : (row[1] || 'delete')) as any;
      const label = labelIdx !== -1 ? String(row[labelIdx] || '').trim() : (row[4] || '');
      const deletedAt = deletedAtIdx !== -1 ? String(row[deletedAtIdx] || '').trim() : (row[5] || '');
      let deletedTimestamp = timestampIdx !== -1 ? Number(row[timestampIdx]) : 0;
      if (!deletedTimestamp || isNaN(deletedTimestamp) || deletedTimestamp <= 0) {
        if (row[6] && !isNaN(Number(row[6]))) {
          deletedTimestamp = Number(row[6]);
        } else if (deletedAt) {
          deletedTimestamp = new Date(deletedAt).getTime();
        }
      }
      if (isNaN(deletedTimestamp) || deletedTimestamp <= 0) {
        deletedTimestamp = Date.now();
      }
      const templeId = dTempleIdIdx !== -1 ? String(row[dTempleIdIdx] || '').trim() : (row[8] || undefined);

      parsedDeletedRecords.push({
        id,
        entityType,
        actionType,
        label,
        deletedAt: deletedAt || new Date(deletedTimestamp).toISOString(),
        deletedTimestamp,
        templeId,
      });
    });
  }

  const extractedFamilyMembers = households.flatMap((h) => h.familyMembers || []);

  // Post-import ID sanitization and integrity validation to fix corrupted templeId/householdId mappings
  const sanitized = sanitizeAppDataset({
    households,
    pastRecords,
    transactions,
    memorialServices,
    templeTodos,
    familyMembers: extractedFamilyMembers,
    temples,
    templeInfo,
  });

  const finalHouseholds = sanitized.households;
  const finalPastRecords = sanitized.pastRecords;
  const finalTransactions = sanitized.transactions;
  const finalMemorialServices = sanitized.memorialServices;
  const finalTempleTodos = sanitized.templeTodos;
  const finalFamilyMembers = sanitized.familyMembers;

  // Use parsed masterOptions directly if present, otherwise merge from data
  const mergedMasterOptions = masterOptions || mergeMasterOptionsWithData(
    EMPTY_MASTER_OPTIONS,
    finalHouseholds,
    finalTransactions
  );

  // 12. Parse Batch Accounting Data (一括会計設定 & 一括会計受付)
  const batchConfigSheetName = findSheet(['一括会計設定', '一括会計設定マスタ', '一括設定']);
  const { headers: batchConfigHeaders, rows: batchConfigRows } = getSheetDataByName(batchConfigSheetName);
  const parsedBatchConfig = batchConfigHeaders.length > 0 && batchConfigRows.length > 0
    ? parseBatchAccountingConfigFromRows([batchConfigHeaders, ...batchConfigRows])
    : null;

  if (parsedBatchConfig) {
    saveBatchAccountingConfig(parsedBatchConfig);
  }

  const batchSheetName = findSheet(['一括会計受付', '一括会計', '一括受付', '一括記帳']);
  const { headers: batchHeaders, rows: batchRows } = getSheetDataByName(batchSheetName);
  let parsedBatchAccountingData: BatchAccountingData | undefined = undefined;
  if ((batchHeaders.length > 0 && batchRows.length > 0) || parsedBatchConfig) {
    const configRows = batchConfigHeaders.length > 0 ? [batchConfigHeaders, ...batchConfigRows] : undefined;
    const receptionRows = batchHeaders.length > 0 ? [batchHeaders, ...batchRows] : undefined;
    const reconstructed = reconstructBatchAccountingData(configRows, receptionRows, finalHouseholds, templeInfo);
    if (reconstructed) {
      parsedBatchAccountingData = reconstructed;
      saveBatchAccountingData(reconstructed);
    }
  }

  // 15. 戦没・災害物故者命日設定
  const disasterSheetName = findSheet(['戦没・災害物故者命日設定', '戦没災害物故者命日設定', '災害物故者命日設定', '戦没物故者命日設定']);
  const { headers: disasterHeaders, rows: disasterRows } = getSheetDataByName(disasterSheetName);
  if (disasterHeaders.length > 0 && disasterRows.length > 0) {
    const parsedDisasterEvents = parseDisasterEventsFromRows([disasterHeaders, ...disasterRows]);
    if (parsedDisasterEvents.length > 0) {
      saveDisasterMemorialEvents(parsedDisasterEvents);
    }
  }

  const totalRecordsCount =
    finalHouseholds.length +
    finalPastRecords.length +
    finalMemorialServices.length +
    finalTempleTodos.length +
    finalTransactions.length +
    finalFamilyMembers.length +
    parsedPriests.length;

  const hasAnyData =
    totalRecordsCount > 0 ||
    Boolean(templeInfo) ||
    (temples && temples.length > 0) ||
    parsedPriests.length > 0 ||
    parsedDeletedRecords.length > 0 ||
    Boolean(parsedBatchAccountingData) ||
    Object.keys(templeMasterOptionsMap).length > 0;

  return {
    templeInfo,
    temples,
    households: finalHouseholds,
    familyMembers: finalFamilyMembers,
    pastRecords: finalPastRecords,
    memorialServices: finalMemorialServices,
    templeTodos: finalTempleTodos,
    transactions: finalTransactions,
    masterOptions: mergedMasterOptions,
    templeMasterOptionsMap: Object.keys(templeMasterOptionsMap).length > 0 ? templeMasterOptionsMap : undefined,
    noticeTemplates,
    priests: parsedPriests.length > 0 ? parsedPriests : undefined,
    deletedRecords: parsedDeletedRecords.length > 0 ? parsedDeletedRecords : undefined,
    batchAccountingData: parsedBatchAccountingData,
    hasAnyData,
    totalRecordsCount,
  };
}
