/**
 * Ageta - メインアプリケーション
 */
import './style.css';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// ========================================
// 初期化 (Supabase)
// ========================================
if (!SUPABASE_URL || !SUPABASE_KEY) {
  document.body.innerHTML = `
    <div class="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
      <div class="text-6xl mb-4">⚠️</div>
      <h2 class="text-xl font-bold mb-2">設定エラー</h2>
      <p class="text-gray-400 text-sm text-center max-w-sm">
        Supabase の設定がありません。.env ファイルに VITE_SUPABASE_URL と VITE_SUPABASE_KEY を設定してください。
      </p>
      <p class="text-gray-500 text-xs mt-4">.env.example を参考にしてください</p>
    </div>
  `;
  throw new Error('Supabase config missing');
}

if (typeof window.supabase?.createClient !== 'function') {
  document.body.innerHTML = `
    <div class="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
      <div class="text-6xl mb-4">⚠️</div>
      <h2 class="text-xl font-bold mb-2">読み込みエラー</h2>
      <p class="text-gray-400 text-sm text-center max-w-sm">
        Supabase ライブラリの読み込みに失敗しました。ネットワーク接続を確認してください。
      </p>
    </div>
  `;
  throw new Error('Supabase library not loaded');
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

// 状態管理
let plants = [];
let currentUser = null;
let cameraStream = null;
let searchQuery = '';
let currentImageTargetPlantId = null;
let currentRenamePlantId = null;
/** 詳細画面で表示中の植物 ID（plant_id） */
let currentDetailPlantId = null;
let currentStatusPlantId = null;
let statusPopoverScrollHandler = null;
let currentConditionPlantId = null;
let conditionStep = 1;
let selectedCondition = null;
let selectedTags = [];

// DOM要素
const els = {
  authScreen: document.getElementById('authScreen'),
  appScreen: document.getElementById('appScreen'),
  emailInput: document.getElementById('emailInput'),
  passwordInput: document.getElementById('passwordInput'),
  signInBtn: document.getElementById('signInBtn'),
  authError: document.getElementById('authError'),
  plantList: document.getElementById('plantList'),
  syncDot: document.getElementById('syncDot'),
  syncText: document.getElementById('syncText'),
  userEmailDisplay: document.getElementById('userEmailDisplay'),
  navCameraBtn: document.getElementById('navCameraBtn'),
  navManualBtn: document.getElementById('navManualBtn'),
  navSearchBtn: document.getElementById('navSearchBtn'),
  navSettingsBtn: document.getElementById('navSettingsBtn'),
  searchSheet: document.getElementById('searchSheet'),
  searchSheetOverlay: document.getElementById('searchSheetOverlay'),
  manualInputModal: document.getElementById('manualInputModal'),
  manualIdInput: document.getElementById('manualIdInput'),
  renameModal: document.getElementById('renameModal'),
  renameTargetId: document.getElementById('renameTargetId'),
  renameNameInput: document.getElementById('renameNameInput'),
  renameIdInput: document.getElementById('renameIdInput'),
  renameSubtitleInput: document.getElementById('renameSubtitleInput'),
  detailScreen: document.getElementById('detailScreen'),
  detailPlantName: document.getElementById('detailPlantName'),
  detailPlantIdBadge: document.getElementById('detailPlantIdBadge'),
  detailPlantSubtitle: document.getElementById('detailPlantSubtitle'),
  detailImage: document.getElementById('detailImage'),
  detailImageWrap: document.getElementById('detailImageWrap'),
  detailImagePlaceholder: document.getElementById('detailImagePlaceholder'),
  detailHistoryList: document.getElementById('detailHistoryList'),
  detailAvgLabel: document.getElementById('detailAvgLabel'),
  settingsModal: document.getElementById('settingsModal'),
  searchInput: document.getElementById('searchInput'),
  sortSelect: document.getElementById('sortSelect'),
  video: document.getElementById('video'),
  canvas: document.getElementById('canvas'),
  scanOverlay: document.getElementById('scanOverlay'),
  scanStatus: document.getElementById('scanStatus'),
  imageFileInput: document.getElementById('imageFileInput'),
  importFileInput: document.getElementById('importFileInput'),
  statusPopover: document.getElementById('statusPopover'),
  statusPopoverOverlay: document.getElementById('statusPopoverOverlay'),
  scrollContainer: document.getElementById('scrollContainer'),
  conditionModal: document.getElementById('conditionModal'),
  conditionStep1: document.getElementById('conditionStep1'),
  conditionStep2: document.getElementById('conditionStep2'),
  conditionTags: document.getElementById('conditionTags'),
  conditionBackBtn: document.getElementById('conditionBackBtn'),
  conditionSaveBtn: document.getElementById('conditionSaveBtn')
};

// ========================================
// XSS対策: HTMLエスケープ
// ========================================
const escapeHtml = (str) => {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML.replace(/'/g, '&#39;');
};

// ========================================
// 認証フロー
// ========================================
const tryRecoverSessionFromStorage = async () => {
  const keysToTry = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('sb-') && k.includes('auth')) keysToTry.push(k);
  }
  try {
    for (const key of [...new Set(keysToTry)]) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const data = JSON.parse(raw);
        const sess = data?.currentSession ?? data?.session ?? data;
        if (sess?.access_token && sess?.refresh_token) {
          const { data: d, error } = await supabase.auth.setSession({
            access_token: sess.access_token,
            refresh_token: sess.refresh_token
          });
          if (!error && d?.user) return d.user;
        }
      }
    }
  } catch (e) { console.warn('Session recovery:', e); }
  return null;
};

const checkUser = async () => {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    session = refreshed;
  }
  if (!session) {
    const user = await tryRecoverSessionFromStorage();
    if (user) {
      currentUser = user;
      showApp();
      return;
    }
    showAuth();
  } else {
    currentUser = session.user;
    showApp();
  }
};

els.signInBtn?.addEventListener('click', async () => {
  const email = (els.emailInput?.value || '').trim();
  const password = els.passwordInput?.value || '';
  els.authError?.classList.add('hidden');
  els.signInBtn.disabled = true;
  els.signInBtn.textContent = "Processing...";

  const resetBtn = () => {
    els.signInBtn.disabled = false;
    els.signInBtn.textContent = "Sign In / Sign Up";
  };

  try {
    if (!email || !password) {
      els.authError.textContent = 'Email と Password を入力してください';
      els.authError?.classList.remove('hidden');
      resetBtn();
      return;
    }

    let { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const isRateLimit = error.message?.toLowerCase().includes('rate limit') || error.message?.toLowerCase().includes('429');
      if (isRateLimit) {
        els.authError.textContent = 'メール送信の制限に達しました。約1時間お待ちください。';
        els.authError?.classList.remove('hidden');
        resetBtn();
        return;
      }
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        const errMsg = signUpError.message?.toLowerCase().includes('rate limit') || signUpError.message?.toLowerCase().includes('429')
          ? 'メール送信の制限に達しました。約1時間お待ちください。'
          : signUpError.message;
        els.authError.textContent = errMsg;
        els.authError?.classList.remove('hidden');
        resetBtn();
        return;
      }
      currentUser = signUpData?.user;
      if (currentUser) {
        alert("アカウントを作成しました！ログインされました。");
        showApp();
      } else {
        els.authError.textContent = 'サインアップに失敗しました。メール確認が必要な場合は確認リンクをチェックしてください。';
        els.authError?.classList.remove('hidden');
        resetBtn();
      }
      return;
    }
    currentUser = data?.user;
    if (currentUser) {
      showApp();
    } else {
      els.authError.textContent = 'ログインに失敗しました。';
      els.authError?.classList.remove('hidden');
      resetBtn();
    }
  } catch (err) {
    console.error('Auth error:', err);
    els.authError.textContent = err?.message || '接続エラー。ネットワークとSupabase設定を確認してください。';
    els.authError?.classList.remove('hidden');
    resetBtn();
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.reload();
});

const showAuth = () => {
  els.authScreen.classList.remove('hidden');
  els.appScreen.classList.add('hidden');
};
const showApp = () => {
  els.authScreen.classList.add('hidden');
  els.authScreen.style.opacity = 0;
  els.appScreen.classList.remove('hidden');
  setTimeout(() => { els.appScreen.style.opacity = 1; if (typeof lucide !== 'undefined') lucide.createIcons(); }, 50);

  els.userEmailDisplay.textContent = currentUser.email;
  updateSyncStatus('online');
  fetchPlants();
};

// ========================================
// データ操作 (Supabase)
// ========================================
const updateSyncStatus = (status) => {
  if (status === 'loading') {
    els.syncDot.className = "w-2 h-2 rounded-full bg-amber-400 animate-pulse";
    els.syncText.textContent = "Syncing...";
  } else if (status === 'online') {
    els.syncDot.className = "w-2 h-2 rounded-full bg-emerald-500";
    els.syncText.textContent = "Online";
  }
};

const fetchPlants = async () => {
  updateSyncStatus('loading');
  const { data, error } = await supabase
    .from('plants')
    .select(`*, logs(*)`);

  if (error) {
    console.error(error);
  } else {
    plants = data.map(p => ({
      db_id: p.id,
      id: p.plant_id,
      name: (p.display_name != null && String(p.display_name).trim() !== '') ? String(p.display_name).trim() : p.plant_id,
      subtitle: p.subtitle != null ? String(p.subtitle) : '',
      image: p.image_url,
      needs_water: p.needs_water === true,
      logs: (p.logs || []).map(l => ({
        type: l.type,
        ts: new Date(l.logged_at).getTime()
      }))
    }));
    render();
    syncDetailIfOpen();
  }
  updateSyncStatus('online');
};

const addPlantToDB = async (plantId, initialImageBlob = null) => {
  updateSyncStatus('loading');

  let imageUrl = null;
  if (initialImageBlob) {
    imageUrl = await uploadImage(initialImageBlob);
  }

  const { data, error } = await supabase
    .from('plants')
    .insert({ user_id: currentUser.id, plant_id: plantId, image_url: imageUrl })
    .select()
    .single();

  if (error) {
    alert("Error adding plant: " + error.message);
  } else {
    await fetchPlants();
  }
};

const LOG_LABELS = { '液肥': '🧪 液肥', '水': '💧 水', '活力剤': '⚡ 活力剤' };
window.confirmAndAddLog = (plantId, type) => {
  const label = LOG_LABELS[type] || type;
  if (!confirm(`${label} を記録しますか？`)) return;
  addLog(plantId, type);
};

window.addLog = async (plantId, type) => {
  const plant = plants.find(p => p.id === plantId);
  if (!plant) return;

  updateSyncStatus('loading');
  const { error } = await supabase
    .from('logs')
    .insert({
      user_id: currentUser.id,
      plant_db_id: plant.db_id,
      type: type
    });

  if (error) console.error(error);

  // 水・液肥・活力剤のいずれかを記録したら needs_water を解除
  const careTypes = ['水', '液肥', '活力剤'];
  if (careTypes.includes(type) && plant.needs_water) {
    await supabase.from('plants').update({ needs_water: false }).eq('id', plant.db_id);
  }
  await fetchPlants();
};

window.deletePlant = async (plantId) => {
  if (!confirm(`Delete ${plantId}?`)) return;
  const plant = plants.find(p => p.id === plantId);
  if (!plant) return;

  updateSyncStatus('loading');
  const { error } = await supabase.from('plants').delete().eq('id', plant.db_id);
  if (error) alert("Delete failed");
  else {
    if (currentDetailPlantId === plantId) window.closeDetail();
    await fetchPlants();
  }
};

const setNeedsWater = async (plantId, value) => {
  const plant = plants.find(p => p.id === plantId);
  if (!plant) return;
  updateSyncStatus('loading');
  const { error } = await supabase.from('plants').update({ needs_water: value }).eq('id', plant.db_id);
  if (error) console.error(error);
  await fetchPlants();
};

window.openStatusPopover = (plantId, ev) => {
  currentStatusPlantId = plantId;
  const popover = els.statusPopover;
  const overlay = els.statusPopoverOverlay;
  if (!popover || !overlay) return;
  const plant = plants.find(p => p.id === plantId);
  const waterBtn = document.getElementById('statusWaterMarkerBtn');
  if (waterBtn) waterBtn.textContent = plant?.needs_water ? '💧 マーカー解除' : '💧 明日水やり(マーカー)';
  overlay.classList.remove('hidden');
  popover.classList.remove('hidden');

  // ビューポート内に収まるよう位置を計算
  const rect = ev?.target?.getBoundingClientRect?.();
  const pad = 12;
  if (rect) {
    let left = rect.left;
    let top = rect.bottom + 4;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.transform = '';
    // 表示後にサイズを取得してビューポート内に収める
    requestAnimationFrame(() => {
      const pw = popover.offsetWidth;
      const ph = popover.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (left + pw > vw - pad) left = Math.max(pad, vw - pw - pad);
      if (left < pad) left = pad;
      if (top + ph > vh - pad) top = rect.top - ph - 4;
      if (top < pad) top = pad;
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    });
  } else {
    popover.style.left = '50%';
    popover.style.top = '50%';
    popover.style.transform = 'translate(-50%, -50%)';
  }

  // スクロール時にポップオーバーを閉じる（該当IDがわからなくなるのを防ぐ）
  const scrollEl = els.scrollContainer || els.plantList?.parentElement;
  if (statusPopoverScrollHandler) {
    scrollEl?.removeEventListener('scroll', statusPopoverScrollHandler);
  }
  statusPopoverScrollHandler = () => closeStatusPopover();
  scrollEl?.addEventListener('scroll', statusPopoverScrollHandler);
};
window.closeStatusPopover = () => {
  els.statusPopoverOverlay?.classList.add('hidden');
  els.statusPopover?.classList.add('hidden');
  currentStatusPlantId = null;
  const scrollEl = els.scrollContainer || els.plantList?.parentElement;
  if (statusPopoverScrollHandler) {
    scrollEl?.removeEventListener('scroll', statusPopoverScrollHandler);
    statusPopoverScrollHandler = null;
  }
};

window.openRenameModal = (plantId) => {
  const plant = plants.find(pl => pl.id === plantId);
  if (!plant) return;
  currentRenamePlantId = plantId;
  if (els.renameTargetId) els.renameTargetId.value = plantId;
  if (els.renameNameInput) els.renameNameInput.value = plant.name || plant.id;
  if (els.renameIdInput) els.renameIdInput.value = plant.id;
  if (els.renameSubtitleInput) els.renameSubtitleInput.value = plant.subtitle || '';
  els.renameModal.classList.remove('hidden');
  els.renameNameInput?.focus();
  if (typeof lucide !== 'undefined') lucide.createIcons();
};
window.closeRenameModal = (e) => {
  if (!e || e.target === els.renameModal) {
    els.renameModal.classList.add('hidden');
    currentRenamePlantId = null;
  }
};

const uploadImage = async (blob) => {
  const fileName = `${currentUser.id}/${Date.now()}.jpg`;
  const { data, error } = await supabase.storage
    .from('plant-images')
    .upload(fileName, blob, { upsert: true });

  if (error) {
    console.error('Upload error', error);
    return null;
  }

  const { data: { publicUrl } } = supabase.storage.from('plant-images').getPublicUrl(fileName);
  return publicUrl;
};

const elsImageInput = document.getElementById('imageFileInput');
window.openImageUpload = (plantId) => {
  currentImageTargetPlantId = plantId;
  elsImageInput.click();
};
elsImageInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !currentImageTargetPlantId) return;

  const plant = plants.find(p => p.id === currentImageTargetPlantId);
  if (!plant) return;

  updateSyncStatus('loading');
  const compressedBlob = await compressImageToBlob(file);
  const publicUrl = await uploadImage(compressedBlob);

  if (publicUrl) {
    await supabase.from('plants').update({ image_url: publicUrl }).eq('id', plant.db_id);
    await fetchPlants();
  }
  e.target.value = '';
});

// ========================================
// データ移行 (JSON Import / Export)
// ========================================
document.getElementById('importBtn').addEventListener('click', () => els.importFileInput.click());
document.getElementById('exportBtn').addEventListener('click', () => {
  const backup = plants.map(p => ({
    id: p.id,
    name: p.name || p.id,
    subtitle: p.subtitle || '',
    logs: [...p.logs].sort((a, b) => b.ts - a.ts).map(l => ({ type: l.type, ts: l.ts })),
    image: p.image || null
  }));
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `plant-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

els.importFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!confirm("手元のバックアップファイルをクラウドにアップロードしますか？\n(重複するIDはスキップされます)\n※ 写真付きの場合はアップロードに時間がかかります")) return;

  let user = currentUser;
  if (!user) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) user = session.user;
  }
  if (!user) {
    const { data: { session } } = await supabase.auth.refreshSession();
    if (session?.user) user = session.user;
  }
  if (!user) {
    const recovered = await tryRecoverSessionFromStorage();
    if (recovered) user = recovered;
  }
  if (!user) {
    alert("セッションが切れています。再度ログインしてください。");
    return;
  }
  currentUser = user;

  updateSyncStatus('loading');
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const raw = String(ev.target.result).replace(/^\uFEFF/, '');
      let parsed = JSON.parse(raw);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      const localData = Array.isArray(parsed)
        ? parsed
        : (parsed.plants || parsed.data || (parsed.plantCycleData ? (typeof parsed.plantCycleData === 'string' ? JSON.parse(parsed.plantCycleData) : parsed.plantCycleData) : []));
      if (!Array.isArray(localData) || localData.length === 0) {
        throw new Error("有効なデータが見つかりません。JSON形式を確認してください。\n例: [{\"id\":\"A-01\",\"logs\":[{\"type\":\"水\",\"ts\":1234567890000}]}]");
      }

      let count = 0;
      const errors = [];
      for (const item of localData) {
        const plantId = item.id ?? item.plant_id;
        if (!plantId) continue;
        const exists = plants.find(p => p.id === plantId);
        if (!exists) {
          let imageUrl = null;
          if (item.image && String(item.image).startsWith('data:image')) {
            try {
              const blob = await fetch(item.image).then(r => r.blob());
              imageUrl = await uploadImage(blob);
            } catch (imgErr) {
              console.warn('Image upload skip:', plantId, imgErr);
            }
          }

          const insertRow = {
            user_id: currentUser.id,
            plant_id: plantId,
            image_url: imageUrl,
            display_name: (item.name != null && String(item.name).trim() !== '') ? String(item.name).trim() : null,
            subtitle: (item.subtitle != null && String(item.subtitle).trim() !== '') ? String(item.subtitle).trim() : null
          };
          const { data: newPlant, error } = await supabase
            .from('plants')
            .insert(insertRow)
            .select()
            .single();

          if (error) {
            errors.push(`${plantId}: ${error.message}`);
            continue;
          }
          count++;

          if (newPlant && item.logs && Array.isArray(item.logs) && item.logs.length > 0) {
            const logsToInsert = item.logs
              .map(l => {
                let ts = l.ts;
                if (ts == null && l.date) {
                  const parts = String(l.date).split('/').map(Number);
                  const now = new Date();
                  const d2 = new Date(now.getFullYear(), (parts[0] || 1) - 1, parts[1] || 1);
                  if (d2 > now) d2.setFullYear(now.getFullYear() - 1);
                  ts = d2.getTime();
                }
                return ts != null && l.type ? { user_id: currentUser.id, plant_db_id: newPlant.id, type: l.type, logged_at: new Date(ts).toISOString() } : null;
              })
              .filter(Boolean);
            if (logsToInsert.length > 0) {
              const { error: logErr } = await supabase.from('logs').insert(logsToInsert);
              if (logErr) console.warn('Log insert warning:', plantId, logErr);
            }
          }
        }
      }
      const msg = errors.length > 0
        ? `取り込み完了: ${count}件追加\n※ ${errors.length}件でエラー:\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? '\n...' : ''}`
        : `取り込み完了: ${count}件追加しました`;
      alert(msg);
      await fetchPlants();
      closeSettingsModal();
    } catch (err) {
      alert("Import Failed: " + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
  e.target.value = '';
});

// ========================================
// ユーティリティ
// ========================================
const compressImageToBlob = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image load failed'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const maxWidth = 600;
        const scale = maxWidth / img.width;
        const w = scale < 1 ? maxWidth : img.width;
        const h = scale < 1 ? img.height * scale : img.height;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(resolve, 'image/jpeg', 0.7);
      };
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
};

const formatDate = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

const ALERT_DAYS = 7;

const calculateAverageInterval = (plant) => {
  const targetTypes = ['水', '液肥', '活力剤'];
  const validLogs = plant.logs.filter(l => targetTypes.includes(l.type));
  if (validLogs.length < 2) return null;
  const sorted = [...validLogs].sort((a, b) => b.ts - a.ts);
  let total = 0, count = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = (sorted[i].ts - sorted[i + 1].ts) / (1000 * 60 * 60 * 24);
    if (diff >= 0.5) { total += diff; count++; }
  }
  return count > 0 ? Math.round(total / count) : null;
};

// 最新の水やりログを取得（ソート用）
const getLastWaterLog = (plant) => {
  const waterLogs = (plant.logs || []).filter(l => l.type === '水' || l.type === '水やり');
  if (waterLogs.length === 0) return null;
  return waterLogs.reduce((a, b) => (a.ts > b.ts ? a : b));
};

// 最新のお世話ログを取得（水・液肥・活力剤のいずれか）
const getLastCareLog = (plant) => {
  const careTypes = ['水', '水やり', '液肥', '活力剤'];
  const careLogs = (plant.logs || []).filter(l => careTypes.includes(l.type));
  if (careLogs.length === 0) return null;
  return careLogs.reduce((a, b) => (a.ts > b.ts ? a : b));
};

// 警告判定（7日以上、水・液肥・活力剤のいずれもしていない場合）
const isAlertNeeded = (plant) => {
  const lastCare = getLastCareLog(plant);
  if (!lastCare) return false;
  const daysAgo = Math.floor((Date.now() - lastCare.ts) / (1000 * 60 * 60 * 24));
  return daysAgo >= ALERT_DAYS;
};

/** 水・液肥・活力剤のみ、新しい順 */
const getWateringLogsNewestFirst = (plant) => {
  const types = ['水', '水やり', '液肥', '活力剤'];
  return [...(plant.logs || [])]
    .filter(l => types.includes(l.type))
    .sort((a, b) => b.ts - a.ts);
};

function populateDetail (plant) {
  if (!plant || !els.detailScreen) return;
  const displayName = plant.name || plant.id;
  els.detailPlantName.textContent = displayName;
  els.detailPlantIdBadge.textContent = plant.id;
  if (plant.subtitle) {
    els.detailPlantSubtitle.textContent = ` · ${plant.subtitle}`;
  } else {
    els.detailPlantSubtitle.textContent = '';
  }
  const avg = calculateAverageInterval(plant);
  const urgent = isAlertNeeded(plant) && !plant.needs_water;
  els.detailAvgLabel.textContent = avg != null ? `Avg: ${avg}d` : 'Avg: —';
  els.detailAvgLabel.className = urgent ? 'text-rose-400/90' : plant.needs_water ? 'text-cyan-400/90' : 'text-emerald-400/90';

  if (plant.image) {
    els.detailImage.src = plant.image;
    els.detailImage.classList.remove('hidden');
    els.detailImagePlaceholder?.classList.add('hidden');
  } else {
    els.detailImage.removeAttribute('src');
    els.detailImage.classList.add('hidden');
    els.detailImagePlaceholder?.classList.remove('hidden');
  }

  const sortedLogs = [...plant.logs].sort((a, b) => b.ts - a.ts);
  const displayLogs = sortedLogs.filter(l => l.type !== '状態').slice(0, 12);
  els.detailHistoryList.innerHTML = displayLogs.length
    ? displayLogs.map(l => `
      <div class="flex justify-between py-2 border-b border-white/10 last:border-0">
        <span class="text-gray-400 font-mono text-[10.5px] flex items-center"><i data-lucide="calendar" class="w-3 h-3 mr-1.5 opacity-70"></i>${escapeHtml(formatDate(l.ts).slice(-5))}</span>
        <span class="text-gray-200 text-[10.5px] font-medium">${escapeHtml(l.type)}</span>
      </div>`).join('')
    : '<div class="p-2 text-center text-xs text-gray-600">No logs</div>';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.openDetail = (plantId) => {
  const plant = plants.find(p => p.id === plantId);
  if (!plant || !els.detailScreen || !els.appScreen) return;
  currentDetailPlantId = plantId;
  populateDetail(plant);
  els.appScreen.classList.add('hidden');
  els.detailScreen.classList.remove('hidden');
  const scrollInner = document.getElementById('detailScroll');
  if (scrollInner) scrollInner.scrollTop = 0;
  requestAnimationFrame(() => {
    els.detailScreen.style.transform = 'translateX(0)';
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
};

window.closeDetail = () => {
  if (!els.detailScreen || !els.appScreen) return;
  currentDetailPlantId = null;
  els.detailScreen.style.transform = 'translateX(100%)';
  setTimeout(() => {
    els.detailScreen.classList.add('hidden');
    els.appScreen.classList.remove('hidden');
  }, 300);
};

function syncDetailIfOpen () {
  if (!els.detailScreen || els.detailScreen.classList.contains('hidden')) return;
  if (!currentDetailPlantId) return;
  const plant = plants.find(p => p.id === currentDetailPlantId);
  if (plant) populateDetail(plant);
  else window.closeDetail();
}

window.confirmAndAddLogFromDetail = (type) => {
  if (!currentDetailPlantId) return;
  window.confirmAndAddLog(currentDetailPlantId, type);
};

window.openImageUploadFromDetail = () => {
  if (currentDetailPlantId) window.openImageUpload(currentDetailPlantId);
};

window.openRenameModalFromDetail = () => {
  if (currentDetailPlantId) window.openRenameModal(currentDetailPlantId);
};

window.openStatusPopoverFromDetail = () => {
  if (!currentDetailPlantId) return;
  window.openStatusPopover(currentDetailPlantId, null);
};

window.deletePlantFromDetail = () => {
  if (currentDetailPlantId) window.deletePlant(currentDetailPlantId);
};

// ========================================
// UI操作系 (モーダルなど)
// ========================================
els.navSettingsBtn?.addEventListener('click', () => els.settingsModal.classList.remove('hidden'));
window.closeSettingsModal = (e) => { if (!e || e.target === els.settingsModal) els.settingsModal.classList.add('hidden'); };

els.navCameraBtn?.addEventListener('click', () => { els.scanOverlay.classList.remove('hidden'); startCamera(); });
els.navManualBtn?.addEventListener('click', () => { els.manualInputModal.classList.remove('hidden'); els.manualIdInput.focus(); });
els.navSearchBtn?.addEventListener('click', () => {
  els.searchSheetOverlay.classList.remove('hidden');
  els.searchSheet.classList.add('open');
  setTimeout(() => els.searchInput?.focus(), 100);
});
window.closeSearchSheet = () => {
  els.searchSheet.classList.remove('open');
  setTimeout(() => els.searchSheetOverlay.classList.add('hidden'), 300);
};
window.closeManualModal = (e) => { if (!e || e.target === els.manualInputModal) els.manualInputModal.classList.add('hidden'); };

document.getElementById('manualSubmitBtn').addEventListener('click', async () => {
  const id = els.manualIdInput.value.trim();
  if (!id) return;
  const exists = plants.find(p => p.id === id);
  if (exists) { alert('Already exists'); return; }
  closeManualModal();
  await addPlantToDB(id);
});

// Status ポップオーバー: 明日水やりマーカー（トグル: 既に true なら false に）
document.getElementById('statusWaterMarkerBtn')?.addEventListener('click', async () => {
  if (!currentStatusPlantId) return;
  const plant = plants.find(p => p.id === currentStatusPlantId);
  const newValue = plant?.needs_water ? false : true;
  await setNeedsWater(currentStatusPlantId, newValue);
  closeStatusPopover();
});

// Status ポップオーバー: 状態を記録
document.getElementById('statusRecordBtn')?.addEventListener('click', () => {
  if (!currentStatusPlantId) return;
  openConditionModal(currentStatusPlantId);
  closeStatusPopover();
});

// 状態記録タグ定義
const CONDITION_TAGS = {
  Good: ['新芽が出た', '花が咲いた', 'ツヤツヤ', '元気'],
  Normal: [],
  Bad: ['葉が黄色い', 'しおれている', '虫・病気', '元気がない']
};

window.openConditionModal = (plantId) => {
  currentConditionPlantId = plantId;
  conditionStep = 1;
  selectedCondition = null;
  selectedTags = [];
  els.conditionStep1?.classList.remove('hidden');
  els.conditionStep2?.classList.add('hidden');
  els.conditionBackBtn?.classList.add('hidden');
  els.conditionModal?.classList.remove('hidden');
};
window.closeConditionModal = (e) => {
  if (!e || e.target === els.conditionModal) {
    els.conditionModal?.classList.add('hidden');
    currentConditionPlantId = null;
  }
};

// Step 1: 状態選択
document.querySelectorAll('.condition-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedCondition = btn.dataset.condition;
    const tags = CONDITION_TAGS[selectedCondition];
    if (tags.length === 0) {
      // Normal: そのまま保存可能、戻るボタン表示
      els.conditionStep1?.classList.add('hidden');
      els.conditionStep2?.classList.add('hidden');
      els.conditionBackBtn?.classList.remove('hidden');
      return;
    }
    els.conditionStep1?.classList.add('hidden');
    els.conditionStep2?.classList.remove('hidden');
    els.conditionBackBtn?.classList.remove('hidden');
    selectedTags = [];
    const container = els.conditionTags;
    if (!container) return;
    container.innerHTML = '';
    tags.forEach(tag => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'px-4 py-2.5 rounded-xl border-2 border-white/20 bg-white/5 text-gray-300 font-semibold text-sm hover:bg-white/10 hover:border-white/30 transition active:scale-95';
      b.textContent = tag;
      b.dataset.tag = tag;
      b.addEventListener('click', () => {
        const idx = selectedTags.indexOf(tag);
        if (idx >= 0) selectedTags.splice(idx, 1);
        else selectedTags.push(tag);
        b.classList.toggle('border-emerald-500', selectedTags.includes(tag));
        b.classList.toggle('bg-emerald-500/20', selectedTags.includes(tag));
        b.classList.toggle('text-emerald-300', selectedTags.includes(tag));
      });
      container.appendChild(b);
    });
  });
});

document.getElementById('conditionCancelBtn')?.addEventListener('click', () => closeConditionModal());

document.getElementById('conditionBackBtn')?.addEventListener('click', () => {
  conditionStep = 1;
  selectedCondition = null;
  selectedTags = [];
  els.conditionStep1?.classList.remove('hidden');
  els.conditionStep2?.classList.add('hidden');
  els.conditionBackBtn?.classList.add('hidden');
});

document.getElementById('conditionSaveBtn')?.addEventListener('click', async () => {
  if (!currentConditionPlantId) return;
  const plant = plants.find(p => p.id === currentConditionPlantId);
  if (!plant) return;

  updateSyncStatus('loading');
  const { error } = await supabase.from('logs').insert({
    user_id: currentUser.id,
    plant_db_id: plant.db_id,
    type: '状態',
    condition: selectedCondition || 'Normal',
    tags: selectedTags.length > 0 ? selectedTags : []
  });
  if (error) console.error(error);
  closeConditionModal();
  await fetchPlants();
});

document.getElementById('renameSubmitBtn').addEventListener('click', async () => {
  const oldId = (els.renameTargetId?.value || currentRenamePlantId || '').trim();
  const newId = (els.renameIdInput?.value || '').trim();
  const displayName = (els.renameNameInput?.value || '').trim();
  const subtitle = (els.renameSubtitleInput?.value || '').trim();

  if (!displayName) {
    alert('名前を入力してください');
    return;
  }
  if (!newId) {
    alert('IDを入力してください');
    return;
  }
  if (!oldId) return;
  const plant = plants.find(p => p.id === oldId);
  if (!plant) return;

  if (newId !== oldId) {
    const exists = plants.find(p => p.id === newId);
    if (exists) {
      alert(`「${newId}」は既に存在します。別のIDを入力してください。`);
      return;
    }
  }

  updateSyncStatus('loading');
  const payload = {
    plant_id: newId,
    display_name: displayName,
    subtitle: subtitle || null
  };
  const { error } = await supabase
    .from('plants')
    .update(payload)
    .eq('id', plant.db_id)
    .eq('user_id', currentUser.id);

  if (error) {
    alert('保存に失敗しました: ' + (error.message || error) + '\n※ Supabase に display_name / subtitle 列が無い場合は supabase-schema-updates.sql を実行してください。');
  } else {
    if (currentDetailPlantId === oldId) currentDetailPlantId = newId;
    closeRenameModal();
    await fetchPlants();
  }
});

// ========================================
// カメラ・スキャン
// ========================================
document.getElementById('closeScanBtn')?.addEventListener('click', () => { els.scanOverlay.classList.add('hidden'); stopCamera(); });
document.getElementById('captureBtn').addEventListener('click', async () => {
  const ctx = els.canvas.getContext('2d');
  els.canvas.width = els.video.videoWidth;
  els.canvas.height = els.video.videoHeight;
  ctx.drawImage(els.video, 0, 0);
  els.scanStatus.textContent = "Analyzing...";

  const blob = await new Promise(r => els.canvas.toBlob(r, 'image/jpeg', 0.8));
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result;
    try {
      const res = await fetch('/api/scan-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: base64 }) });
      const result = await res.json();
      if (result.id && result.id !== 'NOT_FOUND') {
        const exists = plants.find(p => p.id === result.id);
        if (exists) {
          alert(`Found: ${result.id}`);
          stopCamera();
          els.scanOverlay.classList.add('hidden');
        } else {
          if (confirm(`New Plant: ${result.id}\nRegister?`)) {
            stopCamera();
            els.scanOverlay.classList.add('hidden');
            await addPlantToDB(result.id, blob);
          }
        }
      } else {
        els.scanStatus.textContent = "Not recognized";
      }
    } catch (e) { console.error(e); els.scanStatus.textContent = "Error"; }
  };
  reader.readAsDataURL(blob);
});

const startCamera = async () => {
  try { cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); els.video.srcObject = cameraStream; } catch (e) { }
};
const stopCamera = () => { if (cameraStream) cameraStream.getTracks().forEach(t => t.stop()); };

// ========================================
// 描画 (Render)
// ========================================
// needs_water を最優先し、同じなら secondary で比較
const byNeedsWaterFirst = (secondaryCompare) => (a, b) => {
  if (a.needs_water && !b.needs_water) return -1;
  if (!a.needs_water && b.needs_water) return 1;
  return secondaryCompare(a, b);
};

const render = () => {
  let data = plants;
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    data = data.filter(p =>
      p.id.toLowerCase().includes(q) ||
      (p.name && String(p.name).toLowerCase().includes(q)) ||
      (p.subtitle && String(p.subtitle).toLowerCase().includes(q))
    );
  }

  const sortType = els.sortSelect?.value || 'id';
  data = [...data].map((p, i) => ({ ...p, _sortIndex: i }));

  if (sortType === 'id') {
    data.sort(byNeedsWaterFirst((a, b) => a.id.localeCompare(b.id)));
  } else if (sortType === 'alert') {
    data.sort(byNeedsWaterFirst((a, b) => {
      const aDanger = isAlertNeeded(a);
      const bDanger = isAlertNeeded(b);
      if (aDanger && !bDanger) return -1;
      if (!aDanger && bDanger) return 1;
      const aLog = getLastCareLog(a);
      const bLog = getLastCareLog(b);
      const aTime = aLog ? aLog.ts : 0;
      const bTime = bLog ? bLog.ts : 0;
      return aTime - bTime;
    }));
  } else if (sortType === 'dry_slow') {
    data.sort(byNeedsWaterFirst((a, b) => (calculateAverageInterval(b) || 0) - (calculateAverageInterval(a) || 0)));
  } else if (sortType === 'dry_fast') {
    data.sort(byNeedsWaterFirst((a, b) => (calculateAverageInterval(a) || 999) - (calculateAverageInterval(b) || 999)));
  } else {
    // created (Newest): 元の並び順を維持
    data.sort(byNeedsWaterFirst((a, b) => a._sortIndex - b._sortIndex));
  }

  els.plantList.innerHTML = '';
  if (data.length === 0) {
    els.plantList.innerHTML = `<div class="text-center py-20 text-gray-600"><div class="text-6xl mb-4 opacity-30">🌱</div>No Data</div>`;
    return;
  }

  data.forEach(p => {
    const avg = calculateAverageInterval(p);
    const isAlert = isAlertNeeded(p);
    const needsWater = p.needs_water === true;

    const card = document.createElement('div');
    /* sample02 風：ガラスカードではなく「左サムネ＋重ねた白カード」 */
    card.className = 'relative z-10';

    const badgeAvgClass = isAlert && !needsWater ? 'bg-rose-100 text-rose-800 border-rose-200' : needsWater ? 'bg-cyan-100 text-cyan-800 border-cyan-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200';
    const avgBadgeEl = (sortType.includes('dry') && avg) ? `<span class="shrink-0 ${badgeAvgClass} text-[9px] px-1.5 py-0.5 rounded border font-bold ml-1">${escapeHtml(String(avg))}d</span>` : '';

    const wLogs = getWateringLogsNewestFirst(p);
    const wRecent = wLogs[0];
    const wPrev = wLogs[1];

    /** 水やり種別アイコン（sample02 と同系の Lucide） */
    const iconForCareType = (type) => {
      if (type === '水' || type === '水やり') {
        return '<i data-lucide="droplet" class="w-[14px] h-[14px] text-[#06B6D4] shrink-0"></i>';
      }
      if (type === '液肥') {
        return '<i data-lucide="flask-conical" class="w-[14px] h-[14px] text-[#8CBA5A] shrink-0"></i>';
      }
      if (type === '活力剤') {
        return '<i data-lucide="sparkles" class="w-[14px] h-[14px] text-[#D8C243] shrink-0"></i>';
      }
      return '<i data-lucide="droplet" class="w-[14px] h-[14px] text-gray-400 shrink-0"></i>';
    };

    /** 日付（MM/DD）＋種類アイコン（ラベルなし） */
    const logRowHtml = (log) => {
      if (!log) {
        return '<div class="flex items-center gap-1 shrink-0"><span class="text-[10px] font-bold text-gray-300">—</span></div>';
      }
      const d = formatDate(log.ts).slice(-5);
      return `<div class="flex items-center gap-0.5 shrink-0 min-w-0"><span class="text-[10px] font-extrabold text-black whitespace-nowrap">${escapeHtml(d)}</span>${iconForCareType(log.type)}</div>`;
    };

    let logsBlock = '';
    if (wRecent) {
      logsBlock = `<div class="flex flex-row items-center gap-1.5 min-w-0 flex-1 overflow-hidden">${logRowHtml(wRecent)}<span class="text-gray-300 shrink-0 text-[10px] font-light">|</span>${logRowHtml(wPrev)}</div>`;
    } else {
      logsBlock = '<span class="text-[11px] text-gray-400 font-bold whitespace-nowrap truncate">水やり記録なし</span>';
    }

    const imgSrc = p.image ? escapeHtml(p.image) : '';
    /* 行の高さ 90px 固定＝画像の縦も最大 90px */
    const thumbInner = p.image
      ? `<img src="${imgSrc}" alt="" class="w-full h-[90px] max-h-[90px] object-cover rounded-l-[20px] rounded-r-none bg-gray-100">`
      : `<div class="w-full h-[90px] max-h-[90px] flex items-center justify-center bg-gray-100 rounded-l-[20px] rounded-r-none text-gray-400"><i data-lucide="image" class="w-8 h-8 opacity-50"></i></div>`;

    /** sample02 と同じ色面・バッジ・AVG 下線色 */
    let statusClass = 'bg-[#B3D48E]';
    let badgeHtml = '';
    let underlineColor = 'border-[#D0D0D0]';
    let avgTextColor = 'text-gray-800';
    let avgValueColor = 'text-black';
    if (needsWater) {
      statusClass = 'bg-[#06B6D4]';
      badgeHtml = '<div class="absolute -top-[0.3rem] -left-3 w-7 h-7 bg-[#06B6D4] rounded-full flex items-center justify-center text-white z-30 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"><i data-lucide="droplet" class="w-3.5 h-3.5 text-white fill-current"></i></div>';
    } else if (isAlert) {
      statusClass = 'bg-[#E7445B]';
      underlineColor = 'border-[#E7445B]';
      avgTextColor = 'text-[#E7445B]';
      avgValueColor = 'text-[#E7445B]';
      badgeHtml = '<div class="absolute -top-[0.3rem] -left-3 w-7 h-7 bg-[#E7445B] rounded-full flex items-center justify-center text-white z-30 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"><svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 -mt-0.5 text-white"><path d="M12 2L1 21h22L12 2zm-1 7h2v5h-2V9zm0 7h2v2h-2v-2z"/></svg></div>';
    }

    const avgDisplay = avg != null ? escapeHtml(String(avg)) : '--';
    const displayTitle = escapeHtml(p.name || p.id);
    const safeId = escapeHtml(p.id);
    const titlePipe = p.subtitle
      ? `<span class="text-[12px] text-gray-500 font-bold truncate">| ${escapeHtml(p.subtitle)}</span>`
      : `<span class="text-[12px] text-gray-400 font-mono truncate">| ${safeId}</span>`;

    card.innerHTML = `
      <div class="flex h-[90px] max-h-[90px] min-h-[90px] cursor-pointer group relative z-10 overflow-hidden">
        <div class="relative w-32 h-[90px] max-h-[90px] shrink-0 z-10 overflow-hidden transition-transform group-active:scale-95 rounded-l-[20px] rounded-r-none">
          ${thumbInner}
        </div>
        <div class="relative flex-1 -ml-[2.4rem] z-20 min-w-0 h-[90px] max-h-[90px] transition-transform group-active:translate-y-0.5 group-active:translate-x-0.5">
          ${badgeHtml}
          <div class="absolute top-1.5 left-[0.375rem] right-0 bottom-0 ${statusClass} border-2 border-black rounded-[20px]"></div>
          <div class="absolute top-0 left-0 right-1.5 bottom-1.5 bg-white border-2 border-black rounded-[20px] pl-[1.6rem] pr-2 py-1.5 flex flex-col justify-center min-h-0 overflow-hidden">
            <div class="flex items-baseline justify-start gap-1.5 mb-1 w-full min-w-0 shrink-0">
              <h3 class="font-extrabold text-[14px] leading-tight text-black truncate">${displayTitle}</h3>
              ${titlePipe}
              ${avgBadgeEl}
            </div>
            <div class="flex items-center justify-start gap-2 min-h-0 min-w-0">
              <div class="flex items-baseline gap-0.5 border-b-2 ${underlineColor} pb-0.5 shrink-0">
                <span class="text-[10px] font-black uppercase ${avgTextColor}">AVG</span>
                <span class="text-[14px] font-extrabold leading-none ${avgValueColor}">${avgDisplay}<span class="text-[10px] ml-0.5">日</span></span>
              </div>
              <div class="flex-1 min-w-0 overflow-hidden flex items-center">
                ${logsBlock}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    card.querySelector('.cursor-pointer')?.addEventListener('click', () => window.openDetail(p.id));
    els.plantList.appendChild(card);
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
};
els.searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; render(); });
els.sortSelect?.addEventListener('change', render);

// 開始
checkUser();
