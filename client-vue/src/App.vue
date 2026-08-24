<template>
  <!-- 根布局：路由出口 -->
  <router-view />
</template>

<script setup lang="ts">
// 根组件：仅作为 router-view 容器
// 全局初始化（auth.load、space.load）放在 router 守卫里，避免每个页面各自触发
</script>
