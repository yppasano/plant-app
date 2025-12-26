import './style.css'

const STORAGE_KEY = 'plantCycleData'
let plants = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
let targetPlantId = null

// 警告を出す日数（7日以上水やりがないと警告）
const ALERT_DAYS = 7

const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plants))
    render()
  } catch (e) {
    alert('データ容量がいっぱいです。古い写真を削除してください。')
  }
}

// ログ追加
window.addLog = (id, type) => {
  const plant = plants.find(p => p.id === id)
  if (!plant) return
  const today = new Date()
  const dateStr = `${today.getMonth() + 1}/${today.getDate()}`
  const timestamp = today.getTime()
  
  plant.logs.unshift({ type, date: dateStr, ts: timestamp })
  if (plant.logs.length > 50) plant.logs.pop()
  save()
}

// 削除
window.deletePlant = (id) => {
  if (!confirm(`ID: ${id} を削除しますか？`)) return
  plants = plants.filter(p => p.id !== id)
  save()
}

// カメラ起動
window.openCamera = (id) => {
  targetPlantId = id
  document.getElementById('cameraInput').click()
}

// 画像圧縮
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const MAX_WIDTH = 600
        const scale = MAX_WIDTH / img.width
        const width = scale < 1 ? MAX_WIDTH : img.width
        const height = scale < 1 ? img.height * scale : img.height
        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

// 写真選択時の処理
document.getElementById('cameraInput').addEventListener('change', async (e) => {
  if (!e.target.files || !e.target.files[0] || !targetPlantId) return
  const file = e.target.files[0]
  const imageBase64 = await compressImage(file)
  const plant = plants.find(p => p.id === targetPlantId)
  if (plant) {
    plant.image = imageBase64
    save()
  }
  e.target.value = ''
})

// 経過日数の計算関数（数値で返す版）
const calculateDaysAgo = (log) => {
  if (!log) return null
  if (log.ts) {
    const diff = Date.now() - log.ts
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }
  // 古いデータ互換性用
  try {
    const now = new Date()
    const [m, d] = log.date.split('/').map(Number)
    const logDate = new Date(now.getFullYear(), m - 1, d)
    if (logDate > now) logDate.setFullYear(now.getFullYear() - 1)
    const diff = now - logDate
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  } catch (e) {
    return null
  }
}

// 表示用HTML生成
const getDaysAgoHtml = (log) => {
  const days = calculateDaysAgo(log)
  if (days === null) return ''
  if (days === 0) return '<span class="text-teal-600 font-bold ml-1">(今日)</span>'
  return `<span class="text-gray-500 font-bold ml-1">(${days}日前)</span>`
}

// 水やり警告判定
const isAlertNeeded = (plant) => {
  // 最新の「水」ログを探す
  const lastWaterLog = plant.logs.find(l => l.type === '水')
  
  // まだ水やり記録がないなら警告対象（新規株など）
  if (!lastWaterLog) return false // または true にして「まず水やりして！」と促すことも可能

  const days = calculateDaysAgo(lastWaterLog)
  // 7日以上経過していたら警告
  return days !== null && days >= ALERT_DAYS
}

// 描画
const render = () => {
  const listEl = document.getElementById('plantList')
  listEl.innerHTML = ''

  plants.forEach(plant => {
    // アラート判定
    const isDanger = isAlertNeeded(plant)
    
    // カードのスタイル（警告なら赤枠＆薄赤背景、通常なら白背景）
    const cardClass = isDanger 
      ? 'bg-red-50 p-4 rounded-xl shadow border-2 border-red-400 relative overflow-hidden'
      : 'bg-white p-4 rounded-xl shadow border border-gray-100'

    // 警告バッジ
    const alertBadge = isDanger
      ? `<div class="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-bl-lg">水やり注意！</div>`
      : ''

    let log1Html = 'ー'
    let log2Html = 'ー'
    if (plant.logs[0]) log1Html = `${plant.logs[0].type} (${plant.logs[0].date}) ${getDaysAgoHtml(plant.logs[0])}`
    if (plant.logs[1]) log2Html = `${plant.logs[1].type} (${plant.logs[1].date}) ${getDaysAgoHtml(plant.logs[1])}`

    const imageHtml = plant.image 
      ? `<img src="${plant.image}" class="w-full h-48 object-cover rounded-lg mb-3 cursor-pointer hover:opacity-90 shadow-sm" onclick="openCamera('${plant.id}')">`
      : `<div onclick="openCamera('${plant.id}')" class="w-full h-24 bg-gray-100 rounded-lg mb-3 flex items-center justify-center text-gray-400 cursor-pointer hover:bg-gray-200 border-2 border-dashed border-gray-300">
           <span class="text-sm">📷 写真を追加</span>
         </div>`

    const card = document.createElement('div')
    card.className = cardClass
    
    card.innerHTML = `
      ${alertBadge}
      <div class="flex justify-between items-center mb-3">
        <h2 class="text-xl font-bold text-gray-700">${plant.id}</h2>
        <button onclick="deletePlant('${plant.id}')" class="text-xs text-red-400 hover:text-red-600">削除</button>
      </div>
      
      ${imageHtml}
      
      <div class="bg-white/50 p-3 rounded-lg mb-4 text-sm">
        <div class="flex justify-between mb-1 items-center">
          <span class="font-bold text-gray-500 w-12">前回</span> 
          <span class="flex-1 text-right">${log1Html}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="font-bold text-gray-400 w-12">前々回</span> 
          <span class="flex-1 text-right text-gray-400">${log2Html}</span>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <button onclick="addLog('${plant.id}', '液肥')" class="bg-orange-400 hover:bg-orange-500 text-white font-bold py-3 rounded-lg shadow-sm active:scale-95 transition">液肥</button>
        <button onclick="addLog('${plant.id}', '水')" class="bg-blue-400 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-sm active:scale-95 transition">水</button>
        <button onclick="addLog('${plant.id}', '活力剤')" class="bg-yellow-400 hover:bg-yellow-500 text-white font-bold py-3 rounded-lg shadow-sm active:scale-95 transition">活力剤</button>
      </div>
    `
    listEl.appendChild(card)
  })
}

// イベントリスナー
document.getElementById('addBtn').addEventListener('click', () => {
  const input = document.getElementById('plantIdInput')
  const id = input.value.trim()
  if (!id) {
    alert('植物IDを入力してください！')
    return
  }
  if (plants.some(p => p.id === id)) {
    alert('そのIDは既に存在します')
    return
  }
  plants.unshift({ id, logs: [], image: null })
  input.value = ''
  save()
})

render()