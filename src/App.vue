<script setup>
import { useStore } from "@/store";
const store = useStore();
</script>

<template>
  <div :class="{ dark: store.isDarkMode }">
    <router-view />
  </div>
</template>
