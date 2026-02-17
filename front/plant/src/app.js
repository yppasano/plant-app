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

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 状態管理
let plants = [];
let currentUser = null;
let cameraStream = null;
let searchQuery = '';
let currentImageTargetPlantId = null;

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
  fabBtn: document.getElementById('fabBtn'),
  actionSheet: document.getElementById('actionSheet'),
  actionSheetOverlay: document.getElementById('actionSheetOverlay'),
  manualInputModal: document.getElementById('manualInputModal'),
  manualIdInput: document.getElementById('manualIdInput'),
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
const checkUser = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    showApp();
  } else {
    showAuth();
  }
};

els.signInBtn.addEventListener('click', async () => {
  const email = els.emailInput.value;
  const password = els.passwordInput.value;
  els.authError.classList.add('hidden');
  els.signInBtn.disabled = true;
  els.signInBtn.textContent = "Processing...";

  let { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      els.authError.textContent = "Error: " + signUpError.message;
      els.authError.classList.remove('hidden');
      els.signInBtn.disabled = false;
      els.signInBtn.textContent = "Sign In / Sign Up";
    } else {
      alert("アカウントを作成しました！ログインされました。");
      currentUser = signUpData.user;
      showApp();
    }
  } else {
    currentUser = data.user;
    showApp();
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
  setTimeout(() => els.appScreen.style.opacity = 1, 50);

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

// ========================================
// UI操作系 (モーダルなど)
// ========================================
document.getElementById('settingsBtn').addEventListener('click', () => els.settingsModal.classList.remove('hidden'));
window.closeSettingsModal = (e) => { if (!e || e.target === els.settingsModal) els.settingsModal.classList.add('hidden'); };

els.fabBtn.addEventListener('click', () => { els.actionSheetOverlay.classList.remove('hidden'); els.actionSheet.classList.remove('hidden'); });
window.closeActionSheet = () => { els.actionSheetOverlay.classList.add('hidden'); els.actionSheet.classList.add('hidden'); };

document.getElementById('manualOptionBtn').addEventListener('click', () => { closeActionSheet(); els.manualInputModal.classList.remove('hidden'); els.manualIdInput.focus(); });
window.closeManualModal = (e) => { if (!e || e.target === els.manualInputModal) els.manualInputModal.classList.add('hidden'); };

document.getElementById('manualSubmitBtn').addEventListener('click', async () => {
  const id = els.manualIdInput.value.trim();
  if (!id) return;
  const exists = plants.find(p => p.id === id);
  if (exists) { alert('Already exists'); return; }
  closeManualModal();
  await addPlantToDB(id);
});

// ========================================
// カメラ・スキャン
// ========================================
document.getElementById('cameraOptionBtn').addEventListener('click', () => { closeActionSheet(); els.scanOverlay.classList.remove('hidden'); startCamera(); });
document.getElementById('closeScanBtn').addEventListener('click', () => { els.scanOverlay.classList.add('hidden'); stopCamera(); });
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

  const sortType = els.sortSelect.value;
  if (sortType === 'id') data = [...data].sort((a, b) => a.id.localeCompare(b.id));
  else if (sortType === 'alert') data = [...data].sort((a, b) => 0);
  else if (sortType === 'dry_slow') data = [...data].sort((a, b) => (calculateAverageInterval(b) || 0) - (calculateAverageInterval(a) || 0));
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
    const isAlert = false;

    const card = document.createElement('div');
    card.className = `bg-gray-800 border ${isAlert ? 'border-red-900 bg-red-900/10' : 'border-gray-700'} rounded-xl overflow-hidden shadow-lg relative`;

    let badge = '';
    if (sortType.includes('dry') && avg) badge = `<div class="absolute top-4 right-12 bg-gray-700 text-teal-400 text-[10px] px-2 py-1 rounded border border-gray-600 font-bold">AVG ${escapeHtml(String(avg))}d</div>`;

    // ログをts降順で表示（最新5件）
    const displayLogs = sortedLogs.slice(0, 5);
    const logsHtml = displayLogs.map(l => `
      <div class="flex justify-between py-2 border-b border-gray-700 text-sm">
        <span class="text-gray-500 font-mono text-xs">${escapeHtml(formatDate(l.ts))}</span>
        <span class="text-gray-300 bg-gray-700 px-2 rounded text-xs border border-gray-600">${escapeHtml(l.type)}</span>
      </div>`).join('');

    const safeId = escapeHtml(p.id);
    const safeImage = p.image ? escapeHtml(p.image) : '';

    card.innerHTML = `
      ${badge}
      <div class="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition" onclick="toggleAccordion('${safeId}')">
        <div class="flex items-center gap-4">
          <div class="text-2xl">${isAlert ? '⚠️' : '🌿'}</div>
          <div>
            <div class="font-bold text-lg text-gray-100">${safeId}</div>
            <div class="text-xs text-gray-500">Last: <span class="text-gray-300">${escapeHtml(lastDate)}</span></div>
          </div>
        </div>
        <div id="acc-arrow-${safeId}" class="arrow-icon text-gray-500 transition-transform">▼</div>
      </div>
      <div id="acc-content-${safeId}" class="accordion-content bg-gray-900/50 shadow-inner">
        <div class="p-4 border-t border-gray-700 space-y-4">
          <div onclick="openImageUpload('${safeId}')" class="w-full h-48 bg-gray-800 rounded-lg overflow-hidden border border-gray-700 relative group cursor-pointer">
            ${p.image ? `<img src="${safeImage}" class="w-full h-full object-cover" alt="">` : `<div class="flex items-center justify-center h-full text-gray-600 text-xs">No Photo</div>`}
            <div class="absolute inset-0 bg-black/40 hidden group-hover:flex items-center justify-center text-white text-xs font-bold">Change</div>
          </div>
          <div class="space-y-1">
            <div class="flex justify-between text-xs text-gray-500"><span>History</span><span>Avg: ${avg ? escapeHtml(String(avg)) + 'd' : '---'}</span></div>
            <div class="bg-gray-800/50 rounded px-2">${logsHtml || '<div class="p-2 text-center text-xs text-gray-600">No logs</div>'}</div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <button onclick="addLog('${safeId}','液肥')" class="bg-gray-800 border border-green-900 text-green-400 py-2 rounded text-xs font-bold shadow hover:bg-gray-700">液肥</button>
            <button onclick="addLog('${safeId}','水')" class="bg-teal-600 text-white py-2 rounded text-xs font-bold shadow hover:bg-teal-500">水やり</button>
            <button onclick="addLog('${safeId}','活力剤')" class="bg-gray-800 border border-yellow-900 text-yellow-400 py-2 rounded text-xs font-bold shadow hover:bg-gray-700">活力剤</button>
          </div>
          <div class="text-right"><button onclick="deletePlant('${safeId}')" class="text-xs text-gray-600 underline hover:text-red-400">Delete</button></div>
        </div>
      </div>
    `;
    els.plantList.appendChild(card);
  });
};
els.searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; render(); });
els.sortSelect.addEventListener('change', render);

// 開始
checkUser();
