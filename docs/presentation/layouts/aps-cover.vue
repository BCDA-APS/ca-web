<script setup lang="ts">
defineProps<{
  mainTitle?: string
  subtitle?: string
  speaker?: string
  affiliationLine1?: string
  affiliationLine2?: string
  event?: string
  date?: string
}>()
</script>

<template>
  <div class="aps-cover">
    <div class="aps-cover-top" />
    <div class="aps-cover-band">
      <div class="aps-cover-band-content">
        <h1 v-if="mainTitle">{{ mainTitle }}</h1>
        <p v-if="subtitle" class="aps-cover-subtitle">{{ subtitle }}</p>
      </div>
    </div>
    <div class="aps-cover-meta">
      <p v-if="speaker" class="aps-cover-author">{{ speaker }}</p>
      <p v-if="affiliationLine1" class="aps-cover-affiliation">{{ affiliationLine1 }}</p>
      <p v-if="affiliationLine2" class="aps-cover-affiliation">{{ affiliationLine2 }}</p>
      <p v-if="event" class="aps-cover-event">{{ event }}</p>
      <p v-if="date" class="aps-cover-date">{{ date }}</p>
      <div class="aps-cover-extra"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.aps-cover {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: 0.6fr 2.2fr 1.6fr;
  background: #ffffff;
  font-family: "Calibri", "Helvetica Neue", "Arial", sans-serif;
  color: #1a1a1a;
}

.aps-cover-top {
  background: #ffffff;
}

.aps-cover-band {
  position: relative;
  background: #1f4e79;
  display: flex;
  align-items: center;
  justify-content: center;
}

.aps-cover-band::before {
  content: "";
  position: absolute;
  left: 8%;
  bottom: -100%;
  top: 0;
  width: 6px;
  background: #0e3b66;
}

.aps-cover-band-content {
  text-align: center;
  color: #ffffff;
  padding: 0 2rem;
}

.aps-cover-band-content h1 {
  font-size: 3.4rem;
  font-weight: 600;
  margin: 0;
  color: #ffffff;
  letter-spacing: 0.01em;
}

.aps-cover-subtitle {
  font-size: 1.4rem;
  margin: 0.6rem 0 0;
  color: #d5e2ee;
  font-weight: 400;
}

.aps-cover-meta {
  padding: 1.4rem 3rem 1rem calc(8% + 2rem);
}

.aps-cover-meta p {
  margin: 0.1rem 0;
  font-size: 1rem;
}

.aps-cover-author {
  font-weight: 700 !important;
  font-size: 1.1rem !important;
  margin-bottom: 0.1rem !important;
}

.aps-cover-affiliation {
  color: #1a1a1a;
}

.aps-cover-event {
  margin-top: 0.7rem !important;
}

.aps-cover-date {
  margin-top: 0.1rem !important;
}

.aps-cover-extra {
  margin-top: 0.8rem;
  color: #555;
  font-size: 0.85rem;
}
</style>
