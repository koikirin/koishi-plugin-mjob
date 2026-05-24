<template>
  <k-layout>
    <template #header>Mjob Dashboard</template>
    <div class="mjob-dashboard">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="Watchers" name="watchers">
          <watchers-panel />
        </el-tab-pane>
        <el-tab-pane label="Subscriptions" name="subscriptions">
          <subscriptions-panel />
        </el-tab-pane>
        <el-tab-pane label="Exporters" name="exporters">
          <exporters-panel />
        </el-tab-pane>
        <el-tab-pane label="Fids" name="fids">
          <fids-panel />
        </el-tab-pane>
        <el-tab-pane label="Filters" name="filters">
          <filters-panel />
        </el-tab-pane>
      </el-tabs>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import WatchersPanel from './watchers.vue'
import SubscriptionsPanel from './subscriptions.vue'
import ExportersPanel from './exporters.vue'
import FidsPanel from './fids.vue'
import FiltersPanel from './filters.vue'

const activeTab = ref('watchers')
</script>

<style scoped>
.mjob-dashboard {
  padding: 0 16px 16px;
  height: 100%;
}

.mjob-dashboard :deep(.el-tabs) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.mjob-dashboard :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
}

.mjob-dashboard :deep(.el-tab-pane) {
  padding: 8px 0;
}
</style>
