<template>
  <div class="filters-panel">
    <div class="panel-toolbar">
      <el-select v-model="selectedProvider" placeholder="All Providers" clearable size="small" style="width: 160px"
        @change="refresh">
        <el-option v-for="p in providers" :key="p" :label="p" :value="p" />
      </el-select>
      <el-button size="small" @click="refresh">Refresh</el-button>
      <el-button type="primary" size="small" @click="showAddDialog = true">Set Filter</el-button>
    </div>

    <el-table :data="filters" stripe border size="small" style="width: 100%" empty-text="No filter records">
      <el-table-column prop="cid" label="Channel" min-width="250" />
      <el-table-column prop="provider" label="Provider" width="120" />
      <el-table-column label="Status" width="120">
        <template #default="{ row }">
          <el-switch :model-value="!row.disabled" size="small"
            @change="(val) => toggleFilter(row.cid, row.provider, !val)" />
        </template>
      </el-table-column>
      <el-table-column label="State" width="100">
        <template #default="{ row }">
          <el-tag :type="row.disabled ? 'danger' : 'success'" size="small">
            {{ row.disabled ? 'OFF' : 'ON' }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>

    <!-- Set Filter Dialog -->
    <el-dialog v-model="showAddDialog" title="Set Channel Filter" width="420px">
      <el-form label-width="80px">
        <el-form-item label="Channel">
          <el-input v-model="addForm.cid" placeholder="platform:channelId" />
        </el-form-item>
        <el-form-item label="Provider">
          <el-select v-model="addForm.provider" placeholder="Select provider" style="width: 100%">
            <el-option v-for="p in providers" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="Enabled">
          <el-switch v-model="addForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" @click="setFilter">Confirm</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, onMounted } from 'vue'
import { send } from '@koishijs/client'
import { ElMessage } from 'element-plus'
import type { MjobWebUI } from '@hieuzest/koishi-plugin-mjob-webui'

const providers = ref<string[]>([])
const selectedProvider = ref('')
const filters = ref<MjobWebUI.FilterEntry[]>([])
const showAddDialog = ref(false)
const submitting = ref(false)

const addForm = reactive({
  cid: '',
  provider: '',
  enabled: true,
})

async function refresh() {
  try {
    providers.value = await send('mjob-webui/providers')
    filters.value = await send('mjob-webui/filters', selectedProvider.value || undefined)
  } catch (e) {
    console.error(e)
  }
}

async function toggleFilter(cid: string, provider: string, disabled: boolean) {
  try {
    await send('mjob-webui/filter-set', cid, disabled, provider)
    ElMessage.success('Filter updated')
    await refresh()
  } catch (e: any) {
    ElMessage.error(e.message || 'Failed')
  }
}

async function setFilter() {
  if (!addForm.cid || !addForm.provider) {
    ElMessage.warning('Please fill in all fields')
    return
  }
  submitting.value = true
  try {
    await send('mjob-webui/filter-set', addForm.cid, !addForm.enabled, addForm.provider)
    ElMessage.success('Filter set')
    showAddDialog.value = false
    addForm.cid = ''
    addForm.provider = ''
    addForm.enabled = true
    await refresh()
  } catch (e: any) {
    ElMessage.error(e.message || 'Failed')
  } finally {
    submitting.value = false
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
</style>
