<template>
  <div class="exporters-panel">
    <div class="panel-toolbar">
      <el-button size="small" @click="refresh">Refresh</el-button>
      <el-button type="primary" size="small" @click="showInitDialog = true">Init Endpoint</el-button>
    </div>

    <el-table :data="exporters" stripe border size="small" style="width: 100%" row-key="name"
      empty-text="No exporter endpoints configured">
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="expand-section">
            <div v-for="(fids, provider) in row.fids" :key="provider" class="fid-group">
              <h4>{{ provider }} - Filter IDs</h4>
              <div class="fid-tags">
                <el-tag v-for="fid in fids" :key="fid" size="small" closable
                  @close="removeFid(row.name, fid, provider as string)">
                  {{ fid }}
                </el-tag>
                <el-button size="small" type="primary" text @click="openAddFid(row.name, provider as string)">
                  + Add FID
                </el-button>
              </div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="Name" width="150" />
      <el-table-column prop="endpoint" label="Endpoint" min-width="300" show-overflow-tooltip />
      <el-table-column label="Token" width="100">
        <template #default="{ row }">
          <span>{{ row.token ? '***' : '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="Subscriptions" width="150">
        <template #default="{ row }">
          <el-tag v-for="sub in row.subscriptions" :key="`${sub.provider}:${sub.player}`" size="small" class="sub-tag">
            {{ sub.provider }}: {{ sub.player }}
          </el-tag>
          <span v-if="!row.subscriptions?.length">-</span>
        </template>
      </el-table-column>
      <el-table-column label="Actions" width="120" align="center">
        <template #default="{ row }">
          <el-popconfirm title="Clear all subscriptions and fids for this endpoint?" @confirm="clearEndpoint(row)">
            <template #reference>
              <el-button size="small" type="danger" text>Clear</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- Init Endpoint Dialog -->
    <el-dialog v-model="showInitDialog" title="Initialize Exporter Endpoint" width="500px">
      <el-form label-width="100px">
        <el-form-item label="Endpoint">
          <el-select v-model="initForm.endpoint" placeholder="Select endpoint" style="width: 100%">
            <el-option v-for="exp in exporters" :key="exp.name" :label="`${exp.name} (${exp.endpoint})`" :value="exp.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="Provider">
          <el-select v-model="initForm.provider" placeholder="Select provider" style="width: 100%">
            <el-option v-for="p in providers" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="Filter IDs">
          <el-input v-model="initForm.fidsText" type="textarea" :rows="4"
            placeholder="One FID per line (e.g. contest IDs)" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showInitDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" @click="initEndpoint">Init</el-button>
      </template>
    </el-dialog>

    <!-- Add FID Dialog -->
    <el-dialog v-model="showAddFidDialog" title="Add Filter IDs" width="400px">
      <el-form label-width="100px">
        <el-form-item label="Endpoint">
          <el-input :model-value="addFidForm.endpoint" disabled />
        </el-form-item>
        <el-form-item label="Provider">
          <el-input :model-value="addFidForm.provider" disabled />
        </el-form-item>
        <el-form-item label="FIDs">
          <el-input v-model="addFidForm.fidsText" type="textarea" :rows="3" placeholder="One FID per line" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddFidDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" @click="addFid">Add</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, onMounted } from 'vue'
import { send } from '@koishijs/client'
import { ElMessage } from 'element-plus'
import type { MjobWebUI } from '@hieuzest/koishi-plugin-mjob-webui'

const exporters = ref<MjobWebUI.ExporterInfo[]>([])
const providers = ref<string[]>([])
const showInitDialog = ref(false)
const showAddFidDialog = ref(false)
const submitting = ref(false)

const initForm = reactive({
  endpoint: '',
  provider: '',
  fidsText: '',
})

const addFidForm = reactive({
  endpoint: '',
  provider: '',
  fidsText: '',
})

async function refresh() {
  try {
    exporters.value = await send('mjob-webui/exporter-list')
    providers.value = await send('mjob-webui/providers')
  } catch (e) {
    console.error(e)
  }
}

async function initEndpoint() {
  if (!initForm.endpoint || !initForm.provider) {
    ElMessage.warning('Please select endpoint and provider')
    return
  }
  submitting.value = true
  try {
    const fids = initForm.fidsText.split('\n').map(s => s.trim()).filter(Boolean)
    await send('mjob-webui/exporter-init', initForm.endpoint, fids, initForm.provider)
    ElMessage.success('Endpoint initialized')
    showInitDialog.value = false
    initForm.endpoint = ''
    initForm.provider = ''
    initForm.fidsText = ''
    await refresh()
  } catch (e: any) {
    ElMessage.error(e.message || 'Failed')
  } finally {
    submitting.value = false
  }
}

function openAddFid(endpoint: string, provider: string) {
  addFidForm.endpoint = endpoint
  addFidForm.provider = provider
  addFidForm.fidsText = ''
  showAddFidDialog.value = true
}

async function addFid() {
  submitting.value = true
  try {
    const fids = addFidForm.fidsText.split('\n').map(s => s.trim()).filter(Boolean)
    if (!fids.length) return
    await send('mjob-webui/exporter-add-fids', addFidForm.endpoint, fids, addFidForm.provider)
    ElMessage.success('FIDs added')
    showAddFidDialog.value = false
    await refresh()
  } catch (e: any) {
    ElMessage.error(e.message || 'Failed')
  } finally {
    submitting.value = false
  }
}

async function removeFid(endpoint: string, fid: string, provider: string) {
  try {
    await send('mjob-webui/exporter-remove-fids', endpoint, [fid], provider)
    ElMessage.success('FID removed')
    await refresh()
  } catch (e: any) {
    ElMessage.error(e.message || 'Failed')
  }
}

async function clearEndpoint(row: MjobWebUI.ExporterInfo) {
  try {
    for (const sub of row.subscriptions) {
      await send('mjob-webui/exporter-clear', row.name, sub.provider)
    }
    ElMessage.success('Endpoint cleared')
    await refresh()
  } catch (e: any) {
    ElMessage.error(e.message || 'Failed')
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

.expand-section {
  padding: 8px 16px;
}

.fid-group {
  margin-bottom: 12px;
}

.fid-group h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.fid-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.sub-tag {
  margin: 2px;
}
</style>
