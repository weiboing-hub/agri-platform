<template>
  <div v-if="module" class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>页面定义</h2>
        <span :class="['tag', priorityClass]">{{ module.priority }}</span>
      </div>
      <div class="detail-grid">
        <div>
          <div class="detail-label">所属分组</div>
          <div class="detail-value">{{ module.groupTitle }}</div>
        </div>
        <div>
          <div class="detail-label">页面路径</div>
          <div class="detail-value">{{ module.path }}</div>
        </div>
        <div class="detail-span">
          <div class="detail-label">页面用途</div>
          <div class="detail-value">{{ module.purpose }}</div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>核心字段</h2>
      </div>
      <div class="chip-list">
        <span v-for="field in module.fields" :key="field" class="chip">{{ field }}</span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>按钮与操作</h2>
      </div>
      <div class="chip-list">
        <span v-for="action in module.actions" :key="action" class="chip chip-action">{{ action }}</span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>权限点</h2>
      </div>
      <div class="chip-list">
        <span v-for="permission in module.permissions" :key="permission" class="chip chip-permission">{{ permission }}</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { findModuleByPath } from "../config/modules";

const route = useRoute();

const module = computed(() => findModuleByPath(route.path));

const priorityClass = computed(() => {
  if (!module.value) return "tag-p0";
  return {
    P0: "tag-p0",
    P1: "tag-p1",
    P2: "tag-p2"
  }[module.value.priority] || "tag-p0";
});
</script>
