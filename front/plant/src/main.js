console.log('JavaScript is loaded!');
// import './style.css' ... (以下そのまま)
import './style.css'

// データ管理
const STORAGE_KEY = 'plantCycleData'
let plants = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []

const save = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plants))
  render()
}

// ログ追加機能
window.addLog = (id, type) => {
  const plant = plants.find(p => p.id === id)
  if (!plant) return

  const today = new Date()
  const dateStr = `${today.getMonth() + 1}/${today.getDate()}`
  
  // 新しいログを先頭に追加
  plant.logs.unshift({ type, date: dateStr })
  
  // ログは最新50件まで保持
  if (plant.logs.length > 50) plant.logs.pop()
  
  save()
}

// 削除機能
window.deletePlant = (id) => {
  if (!confirm(`ID: ${id} を削除しますか？`)) return
  plants = plants.filter(p => p.id !== id)
  save()
}

// 描画機能
const render = () => {
  const listEl = document.getElementById('plantList')
  listEl.innerHTML = ''

  plants.forEach(plant => {
    // 最新2件のログを取得
    const log1 = plant.logs[0] ? `${plant.logs[0].type} (${plant.logs[0].date})` : 'ー'
    const log2 = plant.logs[1] ? `${plant.logs[1].type} (${plant.logs[1].date})` : 'ー'

    const card = document.createElement('div')
    card.className = 'bg-white p-4 rounded-xl shadow border border-gray-100'
    
    card.innerHTML = `
      <div class="flex justify-between items-center mb-3">
        <h2 class="text-xl font-bold text-gray-700">${plant.id}</h2>
        <button onclick="deletePlant('${plant.id}')" class="text-xs text-red-400 hover:text-red-600">削除</button>
      </div>
      
      <div class="bg-gray-50 p-3 rounded-lg mb-4 text-sm">
        <div class="flex justify-between mb-1"><span class="font-bold text-gray-500">前回</span> <span>${log1}</span></div>
        <div class="flex justify-between"><span class="font-bold text-gray-400">前々回</span> <span class="text-gray-400">${log2}</span></div>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <button onclick="addLog('${plant.id}', '液肥')" class="bg-orange-400 hover:bg-orange-500 text-white font-bold py-3 rounded-lg shadow-sm transition">液肥</button>
        <button onclick="addLog('${plant.id}', '水')" class="bg-blue-400 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-sm transition">水</button>
        <button onclick="addLog('${plant.id}', '活力剤')" class="bg-yellow-400 hover:bg-yellow-500 text-white font-bold py-3 rounded-lg shadow-sm transition">活力剤</button>
      </div>
    `
    listEl.appendChild(card)
  })
}

// イベントリスナー
document.getElementById('addBtn').addEventListener('click', () => {
  const input = document.getElementById('plantIdInput')
  const id = input.value.trim()
  if (!id) return
  
  if (plants.some(p => p.id === id)) {
    alert('そのIDは既に存在します')
    return
  }
  
  plants.push({ id, logs: [] })
  input.value = ''
  save()
})

// 初期描画
render()