<template>
  <div class="subscriptions-panel">
    <div class="panel-toolbar">
      <el-select v-model="selectedProvider" placeholder="All Providers" clearable size="small" style="width: 160px"
        @change="refresh">
        <el-option v-for="p in providers" :key="p" :label="p" :value="p" />
      </el-select>
      <el-button size="small" @click="refresh">Refresh</el-button>
      <el-button type="primary" size="small" @click="showAddDialog = true">Add Subscription</el-button>
    </div>

    <el-table :data="groupedData" stripe border size="small" style="width: 100%" row-key="key"
      empty-text="No subscriptions" default-expand-all>
      <el-table-column prop="cid" label="Channel" min-width="200" />
      <el-table-column prop="provider" label="Provider" width="120" />
      <el-table-column label="Players" min-width="300">
        <template #default="{ row }">
          <div class="player-tags">
            <el-tag v-for="player in row.players" :key="player" size="small" closable
              @close="removeSubscription(row.cid, row.provider, player)">
              {{ player }}
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="Actions" width="120" align="center">
        <template #default="{ row }">
          <el-popconfirm title="Clear all subscriptions for this channel/provider?" @confirm="clearSubscription(row.cid, row.provider)">
            <template #reference>
              <el-button size="small" type="danger" text>Clear</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- Add Dialog -->
    <el-dialog v-model="showAddDialog" title="Add Subscription" width="480px">
      <el-form label-width="80px">
        <el-form-item label="Channel">
          <el-input v-model="addForm.cid" placeholder="platform:channelId" />
        </el-form-item>
        <el-form-item label="Provider">
          <el-select v-model="addForm.provider" placeholder="Select provider" style="width: 100%">
            <el-option v-for="p in providers" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="Players">
          <el-input v-model="addForm.playersText" type="textarea" :rows="3"
            placeholder="One player per line, or * for all" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" @click="addSubscription">Add</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { send } from '@koishijs/client'
import { ElMessage } from 'element-plus'
import type { MjobWebUI } from '@hieuzest/koishi-plugin-mjob-webui'

const providers = ref<string[]>([])
const selectedProvider = ref('')
const subscriptions = ref<MjobWebUI.SubscriptionEntry[]>([])
const showAddDialog = ref(false)
const submitting = ref(false)

const addForm = reactive({
  cid: '',
  provider: '',
  playersText: '',
})

interface GroupedRow {
  key: string
  cid: string
  provider: string
  players: string[]
}

const groupedData = computed<GroupedRow[]>(() => {
  const map = new Map<string, GroupedRow>()
  for (const sub of subscriptions.value) {
    const key = `${sub.cid}:${sub.provider}`
    if (!map.has(key)) {
      map.set(key, { key, cid: sub.cid, provider: sub.provider, players: [] })
    }
    map.get(key)!.players.push(sub.player)
  }
  return [...map.values()]
})

async function refresh() {
  try {
    providers.value = await send('mjob-webui/providers')
    subscriptions.value = await send('mjob-webui/subscriptions', selectedProvider.value || undefined)
  } catch (e) {
    console.error(e)
  }
}

async function addSubscription() {
  if (!addForm.cid || !addForm.provider || !addForm.playersText.trim()) {
    ElMessage.warning('Please fill in all fields')
    return
  }
  submitting.value = true
  try {
    const players = addForm.playersText.split('\n').map(s => s.trim()).filter(Boolean)
    await send('mjob-webui/subscription-add', addForm.cid, players, addForm.provider)
    ElMessage.success('Subscription added')
    showAddDialog.value = false
    addForm.cid = ''
    addForm.provider = ''
    addForm.playersText = ''
    await refresh()
  } catch (e: any) {
    ElMessage.error(e.message || 'Failed')
  } finally {
    submitting.value = false
  }
}

async function removeSubscription(cid: string, provider: string, player: string) {
  try {
    await send('mjob-webui/subscription-remove', cid, [player], provider)
    ElMessage.success('Removed')
    await refresh()
  } catch (e: any) {
    ElMessage.error(e.message || 'Failed')
  }
}

async function clearSubscription(cid: string, provider: string) {
  try {
    await send('mjob-webui/subscription-clear', cid, provider)
    ElMessage.success('Cleared')
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

.player-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
