/**
 * Ageta - 解析ダッシュボード
 */
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// ========================================
// 初期化
// ========================================
if (!SUPABASE_URL || !SUPABASE_KEY) {
  document.getElementById('loadingState').innerHTML = `
    <div class="text-5xl mb-4">⚠️</div>
    <p class="text-gray-400 text-sm">Supabase の設定がありません</p>
    <a href="./index.html" class="mt-4 text-emerald-400 text-sm">管理画面へ</a>
  `;
  throw new Error('Supabase config missing');
}

if (typeof window.supabase?.createClient !== 'function') {
  document.getElementById('loadingState').innerHTML = `
    <div class="text-5xl mb-4">⚠️</div>
    <p class="text-gray-400 text-sm">Supabase ライブラリの読み込みに失敗しました</p>
  `;
  throw new Error('Supabase library not loaded');
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

// ========================================
// 認証チェック
// ========================================
const checkAuth = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    const { data: { session: ref } } = await supabase.auth.refreshSession();
    if (!ref?.user) {
      document.getElementById('loadingState').classList.add('hidden');
      document.getElementById('authError').classList.remove('hidden');
      return null;
    }
    return ref.user;
  }
  return session.user;
};

// ========================================
// データ取得
// ========================================
const fetchData = async (userId) => {
  const { data: plantsData, error: pErr } = await supabase
    .from('plants')
    .select('id, plant_id')
    .eq('user_id', userId);

  if (pErr) {
    console.error(pErr);
    return { plants: [] };
  }

  const { data: logsData, error: lErr } = await supabase
    .from('logs')
    .select('plant_db_id, type, logged_at')
    .eq('user_id', userId);

  if (lErr) console.error(lErr);

  const logsByPlant = new Map();
  for (const l of logsData || []) {
    const list = logsByPlant.get(l.plant_db_id) || [];
    list.push({ type: l.type, ts: new Date(l.logged_at).getTime() });
    logsByPlant.set(l.plant_db_id, list);
  }

  const plants = (plantsData || []).map(p => ({
    db_id: p.id,
    id: p.plant_id,
    logs: logsByPlant.get(p.id) || []
  }));

  return { plants };
};

// ========================================
// 計算ロジック
// ========================================
const CARE_TYPES = ['水', '液肥', '活力剤'];

const getMonthlySummary = (plants) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const counts = { 水: 0, 液肥: 0, 活力剤: 0 };

  for (const p of plants) {
    for (const l of p.logs || []) {
      if (CARE_TYPES.includes(l.type) && l.ts >= startOfMonth) {
        counts[l.type] = (counts[l.type] || 0) + 1;
      }
    }
  }
  return counts;
};

const getHeatmapData = (plants) => {
  const days = {};
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    d.setHours(0, 0, 0, 0);
    days[d.getTime()] = 0;
  }

  for (const p of plants) {
    for (const l of p.logs || []) {
      if (CARE_TYPES.includes(l.type)) {
        const d = new Date(l.ts);
        d.setHours(0, 0, 0, 0);
        const key = d.getTime();
        if (key in days) days[key]++;
      }
    }
  }

  return Object.entries(days)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([ts, count]) => ({ ts: Number(ts), count }));
};

const getWaterIntervals = (plant) => {
  const waterLogs = (plant.logs || []).filter(l => l.type === '水' || l.type === '水やり');
  if (waterLogs.length < 2) return [];
  const sorted = [...waterLogs].sort((a, b) => b.ts - a.ts);
  const intervals = [];
  for (let i = 0; i < sorted.length - 1 && intervals.length < 3; i++) {
    const diff = Math.round((sorted[i].ts - sorted[i + 1].ts) / (1000 * 60 * 60 * 24));
    intervals.push(diff);
  }
  return intervals.reverse();
};

const getFertilizerAlerts = (plants) => {
  const ALERT_DAYS = 30;
  const now = Date.now();
  const alerts = [];

  for (const p of plants) {
    const liquidLogs = (p.logs || []).filter(l => l.type === '液肥').sort((a, b) => b.ts - a.ts);
    const vitalLogs = (p.logs || []).filter(l => l.type === '活力剤').sort((a, b) => b.ts - a.ts);

    const lastLiquid = liquidLogs[0];
    const lastVital = vitalLogs[0];

    const daysSinceLiquid = lastLiquid ? Math.floor((now - lastLiquid.ts) / (1000 * 60 * 60 * 24)) : null;
    const daysSinceVital = lastVital ? Math.floor((now - lastVital.ts) / (1000 * 60 * 60 * 24)) : null;

    const overdueLiquid = daysSinceLiquid === null || daysSinceLiquid >= ALERT_DAYS;
    const overdueVital = daysSinceVital === null || daysSinceVital >= ALERT_DAYS;

    if (overdueLiquid || overdueVital) {
      const items = [];
      if (overdueLiquid) items.push({ type: '液肥', days: daysSinceLiquid });
      if (overdueVital) items.push({ type: '活力剤', days: daysSinceVital });
      alerts.push({ plant: p, items });
    }
  }

  return alerts.sort((a, b) => {
    const maxA = Math.max(...a.items.map(i => i.days ?? 999));
    const maxB = Math.max(...b.items.map(i => i.days ?? 999));
    return maxB - maxA;
  });
};

// ========================================
// レンダリング
// ========================================
const formatDate = (ts) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const renderSummary = (counts) => {
  document.getElementById('summaryWater').textContent = String(counts['水'] ?? 0);
  document.getElementById('summaryLiquid').textContent = String(counts['液肥'] ?? 0);
  document.getElementById('summaryVitality').textContent = String(counts['活力剤'] ?? 0);
};

const renderHeatmap = (data) => {
  const maxCount = Math.max(1, ...data.map(d => d.count));
  const container = document.getElementById('heatmapContainer');
  container.innerHTML = '';

  data.forEach(({ ts, count }) => {
    const cell = document.createElement('div');
    cell.className = 'w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition';
    const ratio = maxCount > 0 ? count / maxCount : 0;
    if (ratio === 0) {
      cell.className += ' bg-white/5 text-gray-500 border border-white/10';
    } else if (ratio <= 0.25) {
      cell.className += ' bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    } else if (ratio <= 0.5) {
      cell.className += ' bg-emerald-500/40 text-emerald-200 border border-emerald-500/40';
    } else if (ratio <= 0.75) {
      cell.className += ' bg-emerald-500/60 text-white border border-emerald-500/50';
    } else {
      cell.className += ' bg-emerald-500/80 text-white border border-emerald-400/50';
    }
    cell.textContent = count || '';
    cell.title = `${formatDate(ts)}: ${count}回`;
    container.appendChild(cell);
  });
};

const renderTrend = (plants) => {
  const container = document.getElementById('trendContainer');
  const plantsWithIntervals = plants
    .map(p => ({ plant: p, intervals: getWaterIntervals(p) }))
    .filter(x => x.intervals.length >= 1);

  if (plantsWithIntervals.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-sm">水やり履歴が2回以上の植物がありません</p>';
    return;
  }

  const maxInterval = Math.max(1, ...plantsWithIntervals.flatMap(x => x.intervals));

  container.innerHTML = plantsWithIntervals.map(({ plant, intervals }) => {
    const bars = intervals.map(int => {
      const w = maxInterval > 0 ? Math.max(8, (int / maxInterval) * 100) : 20;
      return `
        <div class="flex items-center gap-2">
          <div class="w-12 text-gray-400 text-xs">${int}日</div>
          <div class="flex-1 h-6 bg-white/5 rounded-lg overflow-hidden">
            <div class="h-full bg-gradient-to-r from-cyan-500 to-teal-500 rounded-lg transition-all" style="width:${w}%"></div>
          </div>
        </div>
      `;
    }).join('');
    return `
      <div class="glass rounded-xl p-3 border border-white/10">
        <p class="text-gray-200 font-semibold text-sm mb-2">${escapeHtml(plant.id)}</p>
        <div class="space-y-1.5">${bars}</div>
      </div>
    `;
  }).join('');
};

const renderAlerts = (alerts) => {
  const container = document.getElementById('alertContainer');
  if (alerts.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-sm">該当なし</p>';
    return;
  }

  container.innerHTML = alerts.map(({ plant, items }) => {
    const badges = items.map(i => {
      const days = i.days == null ? '未記録' : `${i.days}日前`;
      return `<span class="px-2 py-0.5 rounded-lg text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">${i.type}: ${days}</span>`;
    }).join(' ');
    return `
      <div class="flex items-center justify-between gap-2 glass rounded-xl px-4 py-3 border border-rose-500/20">
        <span class="font-semibold text-gray-200">${escapeHtml(plant.id)}</span>
        <div class="flex flex-wrap gap-2">${badges}</div>
      </div>
    `;
  }).join('');
};

const escapeHtml = (str) => {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML.replace(/'/g, '&#39;');
};

// ========================================
// メイン
// ========================================
const main = async () => {
  const user = await checkAuth();
  if (!user) return;

  const { plants } = await fetchData(user.id);

  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('dashboardContent').classList.remove('hidden');

  renderSummary(getMonthlySummary(plants));
  renderHeatmap(getHeatmapData(plants));
  renderTrend(plants);
  renderAlerts(getFertilizerAlerts(plants));
};

main().catch(err => {
  console.error(err);
  document.getElementById('loadingState').innerHTML = `
    <div class="text-5xl mb-4">⚠️</div>
    <p class="text-gray-400 text-sm">エラーが発生しました</p>
  `;
});
