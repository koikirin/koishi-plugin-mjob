<template>
  <div class="fids-panel">
    <div class="panel-toolbar">
      <el-select v-model="selectedProvider" placeholder="Select Provider" size="small" style="width: 160px"
        @change="onProviderChange">
        <el-option v-for="p in providers" :key="p" :label="p" :value="p" />
      </el-select>
      <el-select v-model="selectedChannel" placeholder="Select Channel" clearable filterable size="small"
        style="width: 240px" @change="refreshFids">
        <el-option label="(Defaults)" value="" />
        <el-option v-for="ch in channels" :key="ch" :label="ch" :value="ch" />
      </el-select>
      <el-button size="small" @click="onProviderChange">Refresh</el-button>
      <el-button type="primary" size="small" @click="showAddDialog = true">Add FIDs</el-button>
    </div>

    <div v-if="selectedProvider" class="fid-content">
      <h4 v-if="!selectedChannel" class="section-title">Default FIDs for {{ selectedProvider }}</h4>
      <h4 v-else class="section-title">FIDs for {{ selectedChannel }} ({{ selectedProvider }})</h4>

      <el-table :data="fids" stripe border size="small" style="width: 100%" empty-text="No FIDs configured">
        <el-table-column prop="fid" label="FID" width="200" />
        <el-table-column prop="fname" label="Name" min-width="300" />
        <el-table-column v-if="selectedChannel" label="Actions" width="100" align="center">
          <template #default="{ row }">
            <el-button size="small" type="danger" text @click="removeFid(row.fid)">Remove</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="selectedChannel" class="reset-area">
        <el-popconfirm title="Reset FIDs to defaults for this channel?" @confirm="resetFids">
          <template #reference>
            <el-button size="small" type="warning">Reset to Defaults</el-button>
          </template>
        </el-popconfirm>
      </div>
    </div>

    <div v-else class="empty-hint">
      <el-empty description="Select a provider to view FIDs" />
    </div>

    <!-- Add FIDs Dialog -->
    <el-dialog v-model="showAddDialog" title="Add Filter IDs" width="450px">
      <el-form label-width="80px">
        <el-form-item label="Channel">
          <el-input :model-value="selectedChannel || '(Defaults)'" disabled />
        </el-form-item>
        <el-form-item label="Provider">
          <el-input :model-value="selectedProvider" disabled />
        </el-form-item>
        <el-form-item label="FIDs">
          <el-input v-model="addFidsText" type="textarea" :rows="4" placeholder="One FID per line" />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="replaceMode">Replace (set) instead of append (add)</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" @click="addFids">Confirm</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { send } from '@koishijs/client'
import { ElMessage } from 'element-plus'
import type { MjobWebUI } from '@hieuzest/koishi-plugin-mjob-webui'

const providers = ref<string[]>([])
const channels = ref<string[]>([])
const selectedProvider = ref('')
const selectedChannel = ref('')
const fids = ref<MjobWebUI.FidEntry[]>([])
const showAddDialog = ref(false)
const addFidsText = ref('')
const replaceMode = ref(false)
const submitting = ref(false)

async function loadProviders() {
  providers.value = await send('mjob-webui/providers')
}

async function onProviderChange() {
  if (!selectedProvider.value) return
  try {
    channels.value = await send('mjob-webui/fid-channels', selectedProvider.value)
  } catch (e) {
    console.error(e)
  }
  await refreshFids()
}

async function refreshFids() {
  if (!selectedProvider.value) return
  try {
    if (selectedChannel.value) {
      fids.value = await send('mjob-webui/fids', selectedChannel.value, selectedProvider.value)
    } else {
      fids.value = await send('mjob-webui/fid-defaults', selectedProvider.value)
    }
  } catch (e) {
    console.error(e)
  }
}

async function addFids() {
  if (!selectedProvider.value) return
  const newFids = addFidsText.value.split('\n').map(s => s.trim()).filter(Boolean)
  if (!newFids.length) return
  submitting.value = true
  try {
    const cid = selectedChannel.value || ''
    if (replaceMode.value) {
      await send('mjob-webui/fid-set', cid, newFids, selectedProvider.value)
    } else {
      await send('mjob-webui/fid-add', cid, newFids, selectedProvider.value)
    }
    ElMessage.success('FIDs updated')
    showAddDialog.value = false
    addFidsText.value = ''
    replaceMode.value = false
    await refreshFids()
  } catch (e: any) {
    ElMessage.error(e.message || 'Failed')
  } finally {
    submitting.value = false
  }
}

async function removeFid(fid: string) {
  if (!selectedProvider.value || !selectedChannel.value) return
  try {
    await send('mjob-webui/fid-remove', selectedChannel.value, [fid], selectedProvider.value)
    ElMessage.success('FID removed')
    await refreshFids()
  } catch (e: any) {
    ElMessage.error(e.message || 'Failed')
  }
}

async function resetFids() {
  if (!selectedProvider.value || !selectedChannel.value) return
  try {
    await send('mjob-webui/fid-reset', selectedChannel.value, selectedProvider.value)
    ElMessage.success('FIDs reset to defaults')
    await refreshFids()
  } catch (e: any) {
    ElMessage.error(e.message || 'Failed')
  }
}

onMounted(loadProviders)
</script>

<style scoped>
.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.fid-content {
  margin-top: 8px;
}

.section-title {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.reset-area {
  margin-top: 12px;
}

.empty-hint {
  margin-top: 40px;
}
</style>
