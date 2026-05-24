<template>
  <div class="watchers-panel">
    <div class="panel-toolbar">
      <el-button type="primary" size="small" :loading="updating" @click="forceUpdate">
        Force Update
      </el-button>
      <el-button size="small" @click="refresh">Refresh</el-button>
      <span class="watcher-count">{{ watchers.length }} active watchers</span>
    </div>

    <el-table :data="watchers" stripe border size="small" style="width: 100%" empty-text="No active watchers">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="type" label="Provider" width="120" />
      <el-table-column prop="watchId" label="Watch ID" min-width="160" show-overflow-tooltip />
      <el-table-column prop="status" label="Status" width="120">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Players" min-width="200">
        <template #default="{ row }">
          <span>{{ row.players?.join(', ') || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="Start Time" width="180">
        <template #default="{ row }">
          <span>{{ row.starttime ? new Date(row.starttime).toLocaleString() : '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="Subscribers" width="100">
        <template #default="{ row }">
          <span>{{ Object.keys(row.subscribers || {}).length }}</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { send } from '@koishijs/client'
import type { MjobWebUI } from '@hieuzest/koishi-plugin-mjob-webui'

const watchers = ref<MjobWebUI.WatcherInfo[]>([])
const updating = ref(false)

function statusType(status: string) {
  switch (status) {
    case 'playing': return 'success'
    case 'waiting': return 'warning'
    case 'finished': case 'earlyFinished': return 'info'
    case 'error': return 'danger'
    case 'reconnecting': return 'warning'
    default: return 'info'
  }
}

async function refresh() {
  try {
    watchers.value = await send('mjob-webui/watchers')
  } catch (e) {
    console.error(e)
  }
}

async function forceUpdate() {
  updating.value = true
  try {
    await send('mjob-webui/force-update')
    await new Promise(r => setTimeout(r, 1000))
    await refresh()
  } finally {
    updating.value = false
  }
}

onMounted(refresh)
</script>

<style scoped>
.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.watcher-count {
  margin-left: auto;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
