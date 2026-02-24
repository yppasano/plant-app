/**
 * Cycle Monitor Cloud - メインアプリケーション
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
  renameInput: document.getElementById('renameInput'),
  settingsModal: document.getElementById('settingsModal'),
  searchInput: document.getElementById('searchInput'),
  sortSelect: document.getElementById('sortSelect'),
  video: document.getElementById('video'),
  canvas: document.getElementById('canvas'),
  scanOverlay: document.getElementById('scanOverlay'),
  scanStatus: document.getElementById('scanStatus'),
  imageFileInput: document.getElementById('imageFileInput'),
  importFileInput: document.getElementById('importFileInput')
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
    els.syncDot.className = "w-2 h-2 rounded-full bg-yellow-400 animate-pulse mr-1";
    els.syncText.textContent = "Syncing...";
  } else if (status === 'online') {
    els.syncDot.className = "w-2 h-2 rounded-full bg-teal-500 mr-1";
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
      image: p.image_url,
      logs: p.logs.map(l => ({
        type: l.type,
        ts: new Date(l.logged_at).getTime()
      }))
    }));
    render();
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
  await fetchPlants();
};

window.deletePlant = async (plantId) => {
  if (!confirm(`Delete ${plantId}?`)) return;
  const plant = plants.find(p => p.id === plantId);
  if (!plant) return;

  updateSyncStatus('loading');
  const { error } = await supabase.from('plants').delete().eq('id', plant.db_id);
  if (error) alert("Delete failed");
  else await fetchPlants();
};

window.openRenameModal = (plantId) => {
  currentRenamePlantId = plantId;
  els.renameInput.value = plantId;
  els.renameModal.classList.remove('hidden');
  els.renameInput.focus();
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

          const { data: newPlant, error } = await supabase
            .from('plants')
            .insert({ user_id: currentUser.id, plant_id: plantId, image_url: imageUrl })
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

document.getElementById('renameSubmitBtn').addEventListener('click', async () => {
  const newName = els.renameInput.value.trim();
  if (!newName) {
    alert('名前を入力してください');
    return;
  }
  if (!currentRenamePlantId) return;
  const plant = plants.find(p => p.id === currentRenamePlantId);
  if (!plant) return;

  if (newName === currentRenamePlantId) {
    closeRenameModal();
    return;
  }
  const exists = plants.find(p => p.id === newName);
  if (exists) {
    alert(`「${newName}」は既に存在します。別の名前を入力してください。`);
    return;
  }

  updateSyncStatus('loading');
  const { error } = await supabase
    .from('plants')
    .update({ plant_id: newName })
    .eq('id', plant.db_id)
    .eq('user_id', currentUser.id);

  if (error) {
    alert('名前の変更に失敗しました: ' + (error.message || error));
  } else {
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
window.toggleAccordion = (id) => {
  const safeId = id != null ? String(id) : '';
  const content = document.getElementById(`acc-content-${safeId}`);
  const arrow = document.getElementById(`acc-arrow-${safeId}`);
  if (content) content.classList.toggle('expanded');
  if (arrow) arrow.classList.toggle('rotated');
};

const render = () => {
  let data = plants;
  if (searchQuery) data = data.filter(p => p.id.toLowerCase().includes(searchQuery.toLowerCase()));

  const sortType = els.sortSelect?.value || 'created';
  if (sortType === 'id') data = [...data].sort((a, b) => a.id.localeCompare(b.id));
  else if (sortType === 'alert') {
    data = [...data].sort((a, b) => {
      const aDanger = isAlertNeeded(a);
      const bDanger = isAlertNeeded(b);
      if (aDanger && !bDanger) return -1;
      if (!aDanger && bDanger) return 1;
      const aLog = getLastCareLog(a);
      const bLog = getLastCareLog(b);
      const aTime = aLog ? aLog.ts : 0;
      const bTime = bLog ? bLog.ts : 0;
      return aTime - bTime;
    });
  } else if (sortType === 'dry_slow') data = [...data].sort((a, b) => (calculateAverageInterval(b) || 0) - (calculateAverageInterval(a) || 0));
  else if (sortType === 'dry_fast') data = [...data].sort((a, b) => (calculateAverageInterval(a) || 999) - (calculateAverageInterval(b) || 999));

  els.plantList.innerHTML = '';
  if (data.length === 0) {
    els.plantList.innerHTML = `<div class="text-center py-20 text-gray-500"><div class="text-6xl mb-4 opacity-20">🌱</div>No Data</div>`;
    return;
  }

  data.forEach(p => {
    const avg = calculateAverageInterval(p);
    // ログをts降順でソートして最新を取得
    const sortedLogs = [...p.logs].sort((a, b) => b.ts - a.ts);
    const lastLog = sortedLogs[0];
    const lastDate = lastLog ? formatDate(lastLog.ts) : '---';
    const lastType = lastLog ? lastLog.type : '';
    const isAlert = isAlertNeeded(p);

    const card = document.createElement('div');
    const cardClass = isAlert ? 'glass-card-alert' : 'glass-card';
    card.className = `${cardClass} rounded-2xl overflow-hidden transition-all duration-300 relative ${!isAlert ? 'hover:border-emerald-500/30' : ''}`;

    const badgeAvgClass = isAlert ? 'bg-rose-900/80 text-rose-300 border-rose-500/30' : 'bg-emerald-900/80 text-emerald-300 border-emerald-500/30';
    const avgBadgeEl = (sortType.includes('dry') && avg) ? `<span class="shrink-0 ${badgeAvgClass} text-[10px] px-2 py-0.5 rounded-lg border font-bold backdrop-blur-sm">AVG ${escapeHtml(String(avg))}d</span>` : '';

    const avgTextColor = isAlert ? 'text-rose-400/80' : 'text-emerald-400/80';
    const iconBg = isAlert ? 'from-rose-500/20 to-orange-500/10 text-rose-400 border-rose-500/30' : 'from-emerald-500/20 to-teal-500/10 text-emerald-400 border-white/10';
    const listIconSvg = isAlert
      ? '<svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 drop-shadow-sm"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6"><path d="M12 2 C 22 6 22 16 12 20 C 2 16 2 6 12 2 Z" /><polyline points="12 2 12 9 6 12 16 15 12 17 12 23" /></svg>';
    const alertPing = isAlert ? '<span class="absolute -top-1 -right-1 flex h-3 w-3"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-rose-500 border border-gray-900"></span></span>' : '';

    const displayLogs = sortedLogs.slice(0, 5);
    const logsHtml = displayLogs.map(l => `
      <div class="flex justify-between py-2.5 border-b border-white/10 last:border-0">
        <span class="text-gray-400 font-mono text-[10.5px] flex items-center"><i data-lucide="calendar" class="w-3 h-3 mr-1.5 opacity-70"></i>${escapeHtml(formatDate(l.ts).slice(-5))}</span>
        <span class="text-gray-200 text-[10.5px] font-medium">${escapeHtml(l.type)}</span>
      </div>`).join('');

    const safeId = escapeHtml(p.id);
    const safeImage = p.image ? escapeHtml(p.image) : '';

    card.innerHTML = `
      <div class="p-5 flex items-center gap-3 cursor-pointer group" onclick="toggleAccordion('${safeId}')">
        <div class="relative w-12 h-12 rounded-xl bg-gradient-to-br ${iconBg} border flex items-center justify-center shadow-inner shrink-0">${listIconSvg}${alertPing}</div>
        <div class="min-w-0 flex-1 flex flex-col">
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-bold text-lg ${isAlert ? 'text-rose-50' : 'text-gray-100 group-hover:text-emerald-300'} transition-colors truncate">${safeId}</span>
            ${avgBadgeEl}
          </div>
          <div class="text-xs ${isAlert ? 'text-rose-400' : 'text-gray-400'} mt-0.5 flex items-center gap-1 min-w-0 overflow-hidden">
            <i data-lucide="clock" class="w-3 h-3 shrink-0"></i> Last: <span class="${isAlert ? 'text-rose-300 font-bold' : 'text-gray-200'}">${escapeHtml(lastDate)}</span>${lastType ? ` <span class="text-emerald-400 font-medium">${escapeHtml(lastType)}</span>` : ''}
          </div>
        </div>
        <div class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition shrink-0">
          <i data-lucide="chevron-down" id="acc-arrow-${safeId}" class="arrow-icon w-5 h-5 text-gray-400 transition-transform duration-300"></i>
        </div>
      </div>
      <div id="acc-content-${safeId}" class="accordion-content bg-black/40 shadow-inner">
        <div class="p-5 border-t border-white/5 space-y-5">
          <div class="flex gap-4 items-stretch">
            <div class="w-3/5 flex flex-col min-w-0">
              <div class="flex justify-between text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-1 mb-1 border-b border-white/10 pb-2">
                <span>History</span>
                <span class="${avgTextColor}">Avg: ${avg ? escapeHtml(String(avg)) + 'd' : '--'}</span>
              </div>
              <div class="flex-1 overflow-y-auto px-1">${logsHtml || '<div class="p-2 text-center text-xs text-gray-600">No logs</div>'}</div>
            </div>
            <div onclick="openImageUpload('${safeId}')" class="w-2/5 aspect-[3/4] bg-black/50 rounded-xl overflow-hidden border border-white/10 relative group cursor-pointer shrink-0">
              ${p.image ? `<img src="${safeImage}" class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition duration-500 group-hover:scale-105" alt="">` : `<div class="absolute inset-0 flex flex-col items-center justify-center text-gray-500 text-[10px] gap-1.5"><i data-lucide="image" class="w-6 h-6 opacity-50"></i><span>Add photo</span></div>`}
              <div class="absolute inset-0 bg-emerald-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity backdrop-blur-sm"><i data-lucide="camera" class="w-4 h-4 mr-1"></i></div>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <button onclick="confirmAndAddLog('${safeId}','液肥')" class="bg-gradient-to-b from-emerald-500/20 to-emerald-600/5 border border-emerald-500/50 text-emerald-300 py-3 rounded-xl text-xs font-bold hover:from-emerald-500/30 transition flex flex-col items-center gap-1.5 active:scale-95 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
              <i data-lucide="flask-conical" class="w-5 h-5"></i> 液肥
            </button>
            <button onclick="confirmAndAddLog('${safeId}','水')" class="bg-gradient-to-b from-cyan-500/20 to-cyan-600/5 border border-cyan-500/50 text-cyan-300 py-3 rounded-xl text-xs font-bold hover:from-cyan-500/30 transition flex flex-col items-center gap-1.5 active:scale-95 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
              <i data-lucide="droplets" class="w-5 h-5"></i> 水
            </button>
            <button onclick="confirmAndAddLog('${safeId}','活力剤')" class="bg-gradient-to-b from-amber-500/20 to-amber-600/5 border border-amber-500/50 text-amber-300 py-3 rounded-xl text-xs font-bold hover:from-amber-500/30 transition flex flex-col items-center gap-1.5 active:scale-95 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
              <i data-lucide="sparkles" class="w-5 h-5"></i> 活力剤
            </button>
          </div>
          <div class="flex justify-end gap-4 pt-2 mt-6 border-t border-white/5">
            <button onclick="openRenameModal('${safeId}')" class="text-xs text-gray-500 hover:text-emerald-400 transition flex items-center gap-1">
              <i data-lucide="edit-3" class="w-3 h-3"></i> Rename Plant
            </button>
            <button onclick="deletePlant('${safeId}')" class="text-xs text-gray-500 hover:text-red-400 transition flex items-center gap-1">
              <i data-lucide="trash-2" class="w-3 h-3"></i> Delete Plant
            </button>
          </div>
        </div>
      </div>
    `;
    els.plantList.appendChild(card);
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
};
els.searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; render(); });
els.sortSelect?.addEventListener('change', render);

// 開始
checkUser();
