<template>
  <div v-if="hasError" class="panel route-error-panel">
    <div class="panel-header">
      <h2>页面加载异常</h2>
      <span class="tag tag-warning">已拦截</span>
    </div>
    <div class="detail-value">
      当前页面在切换过程中出现运行错误，已阻止整块内容区域变成空白。
    </div>
    <div class="error-text route-error-message">{{ errorMessage }}</div>
    <div class="inline-actions">
      <button class="primary-button" type="button" @click="resetBoundary">重试当前页面</button>
      <button class="ghost-button" type="button" @click="goDashboard">返回总览</button>
    </div>
  </div>
  <slot v-else />
</template>

<script setup>
import { onErrorCaptured, ref, watch } from "vue";
import { useRouter } from "vue-router";

const props = defineProps({
  resetKey: {
    type: [String, Number],
    default: ""
  }
});

const router = useRouter();
const hasError = ref(false);
const errorMessage = ref("");

function resetBoundary() {
  hasError.value = false;
  errorMessage.value = "";
}

function goDashboard() {
  resetBoundary();
  router.push("/dashboard/overview");
}

watch(
  () => props.resetKey,
  () => {
    resetBoundary();
  }
);

onErrorCaptured((error, instance, info) => {
  hasError.value = true;
  errorMessage.value = error?.message || "未知页面异常";
  console.error("[route-error-boundary]", info, error, instance);
  return false;
});
</script>
