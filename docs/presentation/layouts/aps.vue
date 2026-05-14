<script setup lang="ts">
defineProps<{
  heading?: string
}>()
</script>

<template>
  <div class="aps-slide">
    <header v-if="heading" class="aps-slide-header">
      <h1>{{ heading }}</h1>
    </header>
    <div class="aps-slide-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.aps-slide {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  font-family: "Calibri", "Helvetica Neue", "Arial", sans-serif;
  color: #1a1a1a;
}

.aps-slide-header {
  padding: 1rem 2.4rem 0.4rem;
  border-bottom: 2px solid #1f4e79;
  margin: 0 1.2rem 1rem;
}

.aps-slide-header h1 {
  margin: 0;
  text-align: center;
  font-size: 1.8rem;
  font-weight: 600;
  color: #1f4e79;
  letter-spacing: 0.01em;
}

.aps-slide-body {
  flex: 1;
  padding: 0 2.4rem 1.6rem;
  font-size: 1rem;
  line-height: 1.45;
  overflow: hidden;
}

.aps-slide-body :deep(h2) {
  color: #1f4e79;
  font-size: 1.25rem;
  margin: 0.6rem 0 0.4rem;
}

.aps-slide-body :deep(ul) {
  list-style: none;
  padding-left: 0;
  margin: 0.4rem 0;
}

.aps-slide-body :deep(ul > li) {
  position: relative;
  padding-left: 1.3em;
  margin: 0.35em 0;
}

.aps-slide-body :deep(ul > li::before) {
  content: "";
  position: absolute;
  left: 0.25em;
  top: 0.55em;
  width: 0.45em;
  height: 0.45em;
  background: #1f4e79;
}

.aps-slide-body :deep(ul ul > li) {
  padding-left: 1.4em;
}

.aps-slide-body :deep(ul ul > li::before) {
  content: "\2013";
  background: transparent;
  width: auto;
  height: auto;
  color: #1f4e79;
  top: 0;
  left: 0.2em;
  font-weight: 600;
}

.aps-slide-body :deep(code) {
  background: #f1f4f8;
  color: #0e3b66;
  padding: 0.05em 0.35em;
  border-radius: 3px;
  font-size: 0.9em;
}

.aps-slide-body :deep(table) {
  border-collapse: collapse;
  font-size: 0.9em;
}

.aps-slide-body :deep(th),
.aps-slide-body :deep(td) {
  border: 1px solid #d8dde3;
  padding: 0.3em 0.7em;
  text-align: left;
}

.aps-slide-body :deep(th) {
  background: #eef2f7;
  color: #0e3b66;
  font-weight: 600;
}

.aps-slide-body :deep(p) {
  margin: 0.5em 0;
}

.aps-slide-body :deep(img) {
  display: block;
  margin: 0.5em auto;
  max-width: 100%;
  max-height: 60vh;
  border: 1px solid #d8dde3;
}
</style>
