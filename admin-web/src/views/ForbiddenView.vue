<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>无可访问菜单</h2>
        <span class="tag tag-warning">403</span>
      </div>
      <div class="detail-value">
        当前账号没有被分配可访问的后台菜单，或者你刚修改了角色权限但还没有重新登录。
      </div>
      <div class="inline-actions">
        <button class="ghost-button" type="button" @click="goFirstAccessible">尝试跳转可访问页面</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useRouter } from "vue-router";
import { getFirstAccessiblePath } from "../config/modules";
import { loadSession } from "../lib/session";

const router = useRouter();

function goFirstAccessible() {
  const session = loadSession();
  const nextPath = getFirstAccessiblePath(session?.permissionCodes || []);
  router.push(nextPath);
}
</script>
