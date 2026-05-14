<script setup lang="ts">
import { useNav } from '@slidev/client'
const { currentPage, total } = useNav()
</script>

<template>
  <footer v-if="currentPage > 1" class="aps-footer">
    <span class="aps-footer-left">ca-web &middot; APS Controls</span>
    <span class="aps-footer-right">{{ currentPage }} / {{ total }}</span>
  </footer>
</template>

<style scoped>
.aps-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  padding: 0.3rem 1.2rem;
  font-size: 0.7rem;
  color: #6b7480;
  font-family: "Calibri", "Helvetica Neue", "Arial", sans-serif;
  background: #ffffff;
  border-top: 1px solid #e1e6ec;
  pointer-events: none;
  z-index: 5;
}
</style>
