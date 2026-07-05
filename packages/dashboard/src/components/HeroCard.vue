<template>
  <div class="flex items-start gap-4 rounded-xl border border-gray-700 bg-gray-800 p-5 transition-colors hover:border-blue-500">
    <!-- Icon area: emoji on the left, centered in a subtle accent background -->
    <div
      v-if="icon"
      class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-[28px]"
    >
      {{ icon }}
    </div>

    <!-- Text body -->
    <div class="flex-1">
      <!-- Title: small, secondary gray -->
      <p class="mb-1 text-sm text-gray-400">{{ title }}</p>

      <!-- Value: large, bold, tabular-nums for alignment -->
      <p
        class="text-[28px] font-bold tabular-nums"
        :class="color || 'text-white'"
      >
        {{ displayValue }}
      </p>

      <!-- Subtitle: small, secondary gray, only shown when provided -->
      <p v-if="subtitle" class="mt-1 text-xs text-gray-400">{{ subtitle }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

defineProps<{
  /** Card heading, e.g. "Total Requests" */
  title: string;
  /** Primary stat to display, e.g. "1,234" or "$5.67" */
  value: string | number;
  /** Optional secondary text below the value, e.g. "+12% vs yesterday" */
  subtitle?: string;
  /** Emoji icon shown on the left */
  icon?: string;
  /** Tailwind text color class for the value, e.g. "text-blue-400". Defaults to white. */
  color?: string;
}>();

/**
 * Format numeric values with locale-aware separators (e.g. 1234 → "1,234").
 * String values pass through unchanged (so "$5.67" stays as-is).
 */
const displayValue = computed(() => {
  if (typeof props.value === 'number') {
    return props.value.toLocaleString();
  }
  return props.value;
});
</script>
