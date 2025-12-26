import './style.css'

const STORAGE_KEY = 'plantCycleData'
let plants = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
let targetPlantId = null // 写真を追加しようとしている植物のID

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
  plant.logs.unshift({ type, date: dateStr })
  if (plant.logs.length > 50) plant.logs.pop()
  save()
}

// 削除
window.deletePlant = (id) => {
  if (!confirm(`ID: ${id} を削除しますか？`)) return
  plants = plants.filter(p => p.id !== id)
  save()
}

// カメラ起動ボタンを押した時の処理
window.openCamera = (id) => {
  targetPlantId = id
  document.getElementById('cameraInput').click()
}

// 画像圧縮処理 (スマホの写真を軽くする魔法)
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        // 最大幅を600pxに制限（これで容量を節約）
        const MAX_WIDTH = 600
        const scale = MAX_WIDTH / img.width
        const width = scale < 1 ? MAX_WIDTH : img.width
        const height = scale < 1 ? img.height * scale : img.height
        
        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)
        // JPEG形式、品質0.7で圧縮
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

// 写真が撮られた（選択された）時の処理
document.getElementById('cameraInput').addEventListener('change', async (e) => {
  if (!e.target.files || !e.target.files[0] || !targetPlantId) return
  
  const file = e.target.files[0]
  const imageBase64 = await compressImage(file)
  
  const plant = plants.find(p => p.id === targetPlantId)
  if (plant) {
    plant.image = imageBase64 // 画像データを保存
    save()
  }
  e.target.value = '' // リセット
})

// 描画
const render = () => {
  const listEl = document.getElementById('plantList')
  listEl.innerHTML = ''

  plants.forEach(plant => {
    const log1 = plant.logs[0] ? `${plant.logs[0].type} (${plant.logs[0].date})` : 'ー'
    const log2 = plant.logs[1] ? `${plant.logs[1].type} (${plant.logs[1].date})` : 'ー'

    // 画像があれば表示、なければ「写真を追加」ボタンを表示
    const imageHtml = plant.image 
      ? `<img src="${plant.image}" class="w-full h-48 object-cover rounded-lg mb-3 cursor-pointer hover:opacity-90 shadow-sm" onclick="openCamera('${plant.id}')">`
      : `<div onclick="openCamera('${plant.id}')" class="w-full h-24 bg-gray-100 rounded-lg mb-3 flex items-center justify-center text-gray-400 cursor-pointer hover:bg-gray-200 border-2 border-dashed border-gray-300">
           <span class="text-sm">📷 写真を追加</span>
         </div>`

    const card = document.createElement('div')
    card.className = 'bg-white p-4 rounded-xl shadow border border-gray-100'
    
    card.innerHTML = `
      <div class="flex justify-between items-center mb-3">
        <h2 class="text-xl font-bold text-gray-700">${plant.id}</h2>
        <button onclick="deletePlant('${plant.id}')" class="text-xs text-red-400 hover:text-red-600">削除</button>
      </div>
      
      ${imageHtml}
      
      <div class="bg-gray-50 p-3 rounded-lg mb-4 text-sm">
        <div class="flex justify-between mb-1"><span class="font-bold text-gray-500">前回</span> <span>${log1}</span></div>
        <div class="flex justify-between"><span class="font-bold text-gray-400">前々回</span> <span class="text-gray-400">${log2}</span></div>
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

// 追加ボタンのイベント
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
  // 画像フィールド(image: null)を追加
  plants.unshift({ id, logs: [], image: null })
  input.value = ''
  save()
})

render()