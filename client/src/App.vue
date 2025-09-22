<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:4000').replace(/\/$/, '')
const SUPPORTED_FILE_DESCRIPTION = 'Word、Excel 或 PDF'
const ACCEPTED_FILE_TYPES = '.doc,.docx,.docm,.odt,.rtf,.xls,.xlsx,.xlsm,.ods,.pdf'
const files = ref([])
const isUploading = ref(false)
const uploadError = ref('')
const listError = ref('')
const isLoadingConfig = ref(false)
const editorVisible = ref(false)
const activeFileId = ref('')
const editorStatus = ref('')
const editorContainerId = 'onlyoffice-editor'
let editorInstance = null
let loadedScriptBase = ''
let scriptPromise = null
const editorPanelRef = ref(null)
const isFullscreen = ref(false)
const deletingFileId = ref('')
const deleteError = ref('')

const formatSize = (size) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const formatDate = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleString()
}

const fetchFiles = async () => {
  listError.value = ''
  deleteError.value = ''
  try {
    const res = await fetch(`${API_BASE}/api/files`)
    if (!res.ok) {
      throw new Error('文件列表加载失败')
    }
    files.value = await res.json()
  } catch (error) {
    console.error(error)
    listError.value = error.message || '文件列表加载失败'
  }
}

let scriptLoadingBase = ''

const loadOnlyOfficeScript = (baseUrl) => {
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const scriptUrl = `${normalizedBase}/web-apps/apps/api/documents/api.js`
  if (window.DocsAPI && loadedScriptBase === normalizedBase) {
    return Promise.resolve()
  }
  if (scriptPromise && scriptLoadingBase === normalizedBase) {
    return scriptPromise
  }

  scriptLoadingBase = normalizedBase
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-onlyoffice]`)
    if (existing) {
      existing.remove()
    }
    const script = document.createElement('script')
    script.src = scriptUrl
    script.async = true
    script.dataset.onlyoffice = 'true'
    script.onload = () => {
      loadedScriptBase = normalizedBase
      scriptLoadingBase = ''
      resolve()
    }
    script.onerror = () => {
      scriptPromise = null
      scriptLoadingBase = ''
      reject(new Error('OnlyOffice 前端脚本加载失败'))
    }
    document.head.appendChild(script)
  })

  return scriptPromise
}

const resetEditor = () => {
  if (editorInstance && typeof editorInstance.destroyEditor === 'function') {
    editorInstance.destroyEditor()
  }
  editorInstance = null
  const container = document.getElementById(editorContainerId)
  if (container) {
    container.innerHTML = ''
  }
}

const getFullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement

const requestElementFullscreen = (element) => {
  if (!element) return Promise.resolve()
  if (element.requestFullscreen) return element.requestFullscreen()
  if (element.webkitRequestFullscreen) return element.webkitRequestFullscreen()
  return Promise.resolve()
}

const exitFullscreen = () => {
  if (document.exitFullscreen) return document.exitFullscreen()
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen()
  return Promise.resolve()
}

const exitFullscreenIfNeeded = () => {
  const panel = editorPanelRef.value
  const fullscreenEl = getFullscreenElement()
  if (fullscreenEl && panel && fullscreenEl === panel) {
    exitFullscreen().catch(() => {})
  }
  isFullscreen.value = false
}

const handleFullscreenChange = () => {
  const panel = editorPanelRef.value
  const fullscreenEl = getFullscreenElement()
  isFullscreen.value = Boolean(panel && fullscreenEl === panel)
}

const toggleFullscreen = () => {
  const panel = editorPanelRef.value
  if (!panel) return

  const fullscreenEl = getFullscreenElement()
  if (!fullscreenEl) {
    requestElementFullscreen(panel)
      .then(() => {
        isFullscreen.value = true
      })
      .catch(() => {})
    return
  }

  if (fullscreenEl === panel) {
    exitFullscreen()
      .then(() => {
        isFullscreen.value = false
      })
      .catch(() => {})
    return
  }

  exitFullscreen()
    .then(() => requestElementFullscreen(panel))
    .then(() => {
      isFullscreen.value = true
    })
    .catch(() => {})
}

const openEditor = async (file) => {
  editorStatus.value = '正在获取 OnlyOffice 配置...'
  isLoadingConfig.value = true
  try {
    const res = await fetch(`${API_BASE}/api/editor/${encodeURIComponent(file.id)}`)
    if (!res.ok) {
      throw new Error('获取编辑配置失败')
    }
    const data = await res.json()
    await loadOnlyOfficeScript(data.onlyofficeBaseUrl)

    editorStatus.value = '正在加载编辑器...'
    editorVisible.value = true
    await nextTick()
    resetEditor()

    editorInstance = new window.DocsAPI.DocEditor(editorContainerId, {
      ...data.config,
      events: {
        onDocumentReady: () => {
          editorStatus.value = '文档已打开，可开始编辑'
        },
        onRequestClose: () => {
          closeEditor()
        },
        onError: (event) => {
          console.error(event)
          editorStatus.value = '编辑器发生错误，请查看控制台日志'
        },
      },
    })

    activeFileId.value = file.id
    editorStatus.value = '正在加载编辑器...'
  } catch (error) {
    console.error(error)
    editorStatus.value = error.message || '打开编辑器失败'
  } finally {
    isLoadingConfig.value = false
  }
}

const closeEditor = () => {
  exitFullscreenIfNeeded()
  resetEditor()
  editorVisible.value = false
  activeFileId.value = ''
  editorStatus.value = ''
  fetchFiles()
}

const onUpload = async (event) => {
  uploadError.value = ''
  const file = event.target.files?.[0]
  if (!file) {
    return
  }

  const formData = new FormData()
  formData.append('file', file)

  isUploading.value = true
  try {
    const res = await fetch(`${API_BASE}/api/files`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const message = await res.json().catch(() => ({}))
      throw new Error(message?.message || '上传失败')
    }
    await res.json()
    await fetchFiles()
    event.target.value = ''
  } catch (error) {
    console.error(error)
    uploadError.value = error.message || '上传失败'
  } finally {
    isUploading.value = false
  }
}

const downloadFile = (file) => {
  if (!file?.url) return
  window.open(file.url, '_blank', 'noopener')
}

const deleteFile = async (file) => {
  if (!file) {
    return
  }
  const confirmed = window.confirm(`确定删除「${file.name}」吗？`)
  if (!confirmed) {
    return
  }

  deleteError.value = ''
  deletingFileId.value = file.id
  try {
    const res = await fetch(`${API_BASE}/api/files/${encodeURIComponent(file.id)}`, {
      method: 'DELETE',
    })
    if (!res.ok && res.status !== 204) {
      const message = await res.json().catch(() => ({}))
      throw new Error(message?.message || '删除失败')
    }
    await fetchFiles()
  } catch (error) {
    console.error(error)
    deleteError.value = error.message || '删除失败'
  } finally {
    deletingFileId.value = ''
  }
}

onMounted(() => {
  fetchFiles()
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
  exitFullscreenIfNeeded()
  resetEditor()
})
</script>

<template>
  <div class="page">
    <header class="page__header">
      <h1>OnlyOffice 在线编辑演示</h1>
      <p>上传本地 {{ SUPPORTED_FILE_DESCRIPTION }} 文档，在 OnlyOffice 编辑器中在线编辑并保存回本地。</p>
    </header>

    <section class="upload">
      <label class="upload__button">
        <input type="file" :accept="ACCEPTED_FILE_TYPES" @change="onUpload" :disabled="isUploading" />
        <span>{{ isUploading ? '上传中...' : '选择 ' + SUPPORTED_FILE_DESCRIPTION + ' 文件上传' }}</span>
      </label>
      <p v-if="uploadError" class="upload__error">{{ uploadError }}</p>
    </section>

    <section class="file-list">
      <header class="file-list__header">
        <h2>文件列表</h2>
        <button class="refresh" type="button" @click="fetchFiles">刷新</button>
      </header>
      <p v-if="listError" class="file-list__error">{{ listError }}</p>
      <p v-if="deleteError" class="file-list__error">{{ deleteError }}</p>
      <table v-if="files.length" class="file-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>大小</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="file in files" :key="file.id">
            <td>{{ file.name }}</td>
            <td>{{ formatSize(file.size) }}</td>
            <td>{{ formatDate(file.lastModified) }}</td>
            <td>
              <div class="file-actions">
                <button type="button" class="secondary" @click="openEditor(file)" :disabled="isLoadingConfig">
                  打开编辑
                </button>
                <button type="button" class="ghost" @click="downloadFile(file)">下载</button>
                <button
                  type="button"
                  class="danger"
                  @click="deleteFile(file)"
                  :disabled="deletingFileId === file.id"
                >
                  {{ deletingFileId === file.id ? '删除中...' : '删除' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="file-list__empty">暂无文件，请先上传。</p>
    </section>

    <section
      v-if="editorVisible"
      ref="editorPanelRef"
      class="editor-panel"
      :class="{ 'editor-panel--fullscreen': isFullscreen }"
    >
      <header class="editor-panel__header">
        <div>
          <strong>当前文件：</strong>
          <span>{{ activeFileId }}</span>
        </div>
        <div class="editor-panel__actions">
          <button type="button" class="ghost" @click="toggleFullscreen">
            {{ isFullscreen ? '退出全屏' : '全屏编辑' }}
          </button>
          <button type="button" class="ghost" @click="closeEditor">关闭编辑器</button>
        </div>
      </header>
      <p v-if="editorStatus" class="editor-panel__status">{{ editorStatus }}</p>
      <div
        class="editor-panel__frame-wrapper"
        :class="{ 'editor-panel__frame-wrapper--fullscreen': isFullscreen }"
      >
        <div
          :id="editorContainerId"
          class="editor-panel__frame"
          :class="{ 'editor-panel__frame--fullscreen': isFullscreen }"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 2rem;
  margin: 0 auto;
  max-width: 1280px;
  width: 100%;
  box-sizing: border-box;
}

.page__header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.75rem;
}

.page__header p {
  margin: 0;
  color: #4a5568;
}

.upload {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.upload__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: fit-content;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  transition: background 0.2s ease;
  font-weight: 600;
}

.upload__button:hover {
  background: #1d4ed8;
}

.upload__button input {
  display: none;
}

.upload__error {
  color: #dc2626;
}

.file-list {
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1rem;
  background: #fff;
}

.file-list__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.file-list__header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.file-list__error {
  color: #dc2626;
}

.file-list__empty {
  margin: 1rem 0;
  color: #6b7280;
}

.file-table {
  width: 100%;
  border-collapse: collapse;
}

.file-table th,
.file-table td {
  text-align: left;
  padding: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.file-table th {
  background: #f8fafc;
  font-weight: 600;
}

button {
  border: none;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

button.refresh {
  background: #334155;
  color: #fff;
}

button.refresh:hover {
  background: #1e293b;
}

button.secondary {
  background: #2563eb;
  color: #fff;
}

button.secondary:hover {
  background: #1d4ed8;
}

button.ghost {
  background: transparent;
  color: #2563eb;
}

button.ghost:hover {
  color: #1d4ed8;
}

button.danger {
  background: #dc2626;
  color: #fff;
}

button.danger:hover {
  background: #b91c1c;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.file-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.editor-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 0.75rem;
  padding: 1rem;
  min-height: 0;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  overflow-x: hidden;
}

.editor-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.editor-panel__actions {
  display: flex;
  gap: 0.75rem;
}

.editor-panel__status {
  margin: 0;
  color: #2563eb;
  font-weight: 500;
}

.editor-panel__frame-wrapper {
  flex: none;
  min-height: 560px;
  height: 65vh;
  max-height: 640px;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  overflow-y: auto;
  overflow-x: hidden;
  background: #f8fafc;
}

.editor-panel__frame {
  width: 100%;
  height: 100%;
  border-radius: 0.5rem;
  background: #fff;
}

.editor-panel--fullscreen {
  width: 100%;
  height: 100%;
  padding: 1rem;
  border-radius: 0;
  max-height: none;
  overflow: hidden;
}

.editor-panel__frame-wrapper--fullscreen {
  flex: 1;
  min-height: 0;
  height: calc(100vh - 140px);
  max-height: none;
  border-radius: 0;
  border: none;
  overflow: hidden;
  background: #fff;
}

.editor-panel__frame--fullscreen {
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

@media (max-width: 768px) {
  .page {
    padding: 1.5rem;
  }

  .editor-panel__frame-wrapper {
    min-height: 420px;
    height: 65vh;
    max-height: 640px;
  }
}
</style>
