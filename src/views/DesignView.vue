<template>
  <div class="flex items-center gap-4 rounded-full w-fit">
    <div class="flex items-center rounded-full bg-white/90">
      <button
        click="handleUpload"
        title="Upload"
        class="group flex cursor-pointer border-none hover:border hover:border-white gap-2.5 rounded-full px-3.5 hover:px-5 py-3 transition-all hover:bg-primary-blue"
      >
        <svg
          class="group-hover:text-white"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M21.74 12.91C21.48 12.05 21.05 11.3 20.48 10.69C19.75 9.86 18.78 9.29 17.69 9.04C17.14 6.54 15.6 4.74 13.41 4.07C11.03 3.33 8.27 4.05 6.54 5.86C5.02 7.45 4.52 9.64 5.11 11.97C3.11 12.46 2.12 14.13 2.01 15.72C2 15.83 2 15.93 2 16.03C2 17.91 3.23 20.02 5.97 20.22H16.35C17.77 20.22 19.13 19.69 20.17 18.74C21.8 17.31 22.4 15.08 21.74 12.91Z"
            fill="currentColor"
          />
        </svg>
        <span class="hidden group-hover:block group-hover:text-white">
          Upload
        </span>
      </button>

      <button
        click="handleCopy"
        title="Copy"
        class="group flex cursor-pointer border-none hover:border hover:border-white gap-2.5 rounded-full px-3.5 hover:px-5 py-3 transition-all hover:bg-primary-blue"
      >
        <svg
          class="group-hover:text-white"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M15.5 13.15H13.33C11.55 13.15 10.1 11.71 10.1 9.92V7.75C10.1 7.34 9.77 7 9.35 7H6.18C3.87 7 2 8.5 2 11.18V17.82C2 20.5 3.87 22 6.18 22H12.07C14.38 22 16.25 20.5 16.25 17.82V13.9C16.25 13.48 15.91 13.15 15.5 13.15Z"
            fill="currentColor"
          />
          <path
            d="M17.8198 2H15.8498H14.7598H11.9298C9.66977 2 7.83977 3.44 7.75977 6.01C7.81977 6.01 7.86977 6 7.92977 6H10.7598H11.8498H13.8198C16.1298 6 17.9998 7.5 17.9998 10.18V12.15V14.86V16.83C17.9998 16.89 17.9898 16.94 17.9898 16.99C20.2198 16.92 21.9998 15.44 21.9998 12.83V10.86V8.15V6.18C21.9998 3.5 20.1298 2 17.8198 2Z"
            fill="currentColor"
          />
          <path
            d="M11.9796 7.14999C11.6696 6.83999 11.1396 7.04999 11.1396 7.47999V10.1C11.1396 11.2 12.0696 12.1 13.2096 12.1C13.9196 12.11 14.9096 12.11 15.7596 12.11C16.1896 12.11 16.4096 11.61 16.1096 11.31C15.0196 10.22 13.0796 8.26999 11.9796 7.14999Z"
            fill="currentColor"
          />
        </svg>
        <span class="hidden group-hover:block group-hover:text-white">
          Copy
        </span>
      </button>

      <button
        click="handleSave"
        title="Save"
        class="group flex cursor-pointer border-none hover:border hover:border-white gap-2.5 rounded-full px-3.5 hover:px-5 py-3 transition-all hover:bg-primary-blue"
      >
        <svg
          class="group-hover:text-white"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M8.78125 13.2002H15.4746C15.6843 13.2002 15.8564 13.3717 15.8564 13.585V19.5C15.8564 19.6933 15.6992 19.8496 15.5059 19.8496H8.75C8.55672 19.8496 8.40039 19.6933 8.40039 19.5V13.585C8.40039 13.3717 8.5716 13.2002 8.78125 13.2002ZM7.8252 3.15039C8.09431 3.1505 8.3125 3.36856 8.3125 3.6377V5.88672C8.3125 6.85441 9.09271 7.64062 10.0566 7.64062H14.2002C15.164 7.64049 15.9434 6.85433 15.9434 5.88672V4.21094C15.9434 4.14578 15.9785 4.09968 16.0195 4.0791C16.0582 4.05972 16.104 4.06116 16.1465 4.09961L18.5703 6.29492C19.3447 6.99621 19.787 7.99515 19.7871 9.04395V16.1514C19.7869 17.6994 18.8424 19.0247 17.502 19.5762C17.3737 19.6289 17.219 19.5336 17.2188 19.3623V13.585C17.2188 12.6173 16.4385 11.8311 15.4746 11.8311H8.78125C7.81734 11.8311 7.03711 12.6173 7.03711 13.585V19.4736C7.03709 19.6348 6.89786 19.7335 6.77051 19.6953C5.25543 19.2392 4.15058 17.8254 4.15039 16.1514V6.84863C4.15062 4.80501 5.79657 3.15039 7.8252 3.15039ZM10.0254 3.15039H14.2314C14.4246 3.15053 14.5811 3.30679 14.5811 3.5V5.88672C14.5811 6.09992 14.4098 6.27134 14.2002 6.27148H10.0566C9.84697 6.27148 9.6748 6.10001 9.6748 5.88672V3.5C9.6748 3.3067 9.83209 3.15039 10.0254 3.15039Z"
            fill="currentColor"
          />
        </svg>
        <span class="hidden group-hover:block group-hover:text-white">
          Save
        </span>
      </button>

      <button
        click="handlePrint"
        title="Print"
        class="group flex cursor-pointer border-none hover:border hover:border-white gap-2.5 rounded-full px-3.5 hover:px-5 py-3 transition-all hover:bg-primary-blue"
      >
        <svg
          class="group-hover:text-white"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M7 5C7 3.34 8.34 2 10 2H14C15.66 2 17 3.34 17 5C17 5.55 16.55 6 16 6H8C7.45 6 7 5.55 7 5Z"
            fill="currentColor"
          />
          <path
            d="M17.75 15C17.75 15.41 17.41 15.75 17 15.75H16V19C16 20.66 14.66 22 13 22H11C9.34 22 8 20.66 8 19V15.75H7C6.59 15.75 6.25 15.41 6.25 15C6.25 14.59 6.59 14.25 7 14.25H17C17.41 14.25 17.75 14.59 17.75 15Z"
            fill="currentColor"
          />
          <path
            d="M18 7H6C4 7 3 8 3 10V15C3 17 4 18 6 18H6.375C6.72018 18 7 17.7202 7 17.375C7 17.0298 6.71131 16.7604 6.38841 16.6384C5.72619 16.3882 5.25 15.7453 5.25 15C5.25 14.04 6.04 13.25 7 13.25H17C17.96 13.25 18.75 14.04 18.75 15C18.75 15.7453 18.2738 16.3882 17.6116 16.6384C17.2887 16.7604 17 17.0298 17 17.375C17 17.7202 17.2798 18 17.625 18H18C20 18 21 17 21 15V10C21 8 20 7 18 7ZM10 11.75H7C6.59 11.75 6.25 11.41 6.25 11C6.25 10.59 6.59 10.25 7 10.25H10C10.41 10.25 10.75 10.59 10.75 11C10.75 11.41 10.41 11.75 10 11.75Z"
            fill="currentColor"
          />
        </svg>
        <span class="hidden group-hover:block group-hover:text-white">
          Print
        </span>
      </button>

      <button
        click="handleSearch"
        title="Search with Google Lens"
        class="group flex cursor-pointer border-none hover:border hover:border-white gap-2.5 rounded-full px-3.5 hover:px-5 py-3 transition-all hover:bg-primary-blue"
      >
        <svg
          class="group-hover:text-white"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9.95 3.00002H7C4.79086 3.00002 3 4.79088 3 7.00002V9.25502"
            stroke="currentColor"
            stroke-linecap="round"
          />
          <path
            d="M9.95 21.07H7C4.79086 21.07 3 19.2791 3 17.07V14.815"
            stroke="currentColor"
            stroke-linecap="round"
          />
          <path
            d="M14.8146 3.00002H17.7646C19.9738 3.00002 21.7646 4.79088 21.7646 7.00002V9.25502"
            stroke="currentColor"
            stroke-linecap="round"
          />
          <path
            d="M14.8146 21.07H17.7646C19.9738 21.07 21.7646 19.2791 21.7646 17.07V14.815"
            stroke="currentColor"
            stroke-linecap="round"
          />
          <path
            d="M11.7913 15.787C13.9775 15.787 15.7497 14.0148 15.7497 11.8287C15.7497 9.64258 13.9775 7.87038 11.7913 7.87038C9.60521 7.87038 7.83301 9.64258 7.83301 11.8287C7.83301 14.0148 9.60521 15.787 11.7913 15.787Z"
            fill="currentColor"
          />
          <path
            d="M16.1663 16.2037L15.333 15.3704"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="hidden group-hover:block group-hover:text-white">
          Search
        </span>
      </button>

      <button
        click="handleEdit"
        title="Edit"
        class="group flex cursor-pointer border-none hover:border hover:border-white gap-2.5 rounded-full px-3.5 hover:px-5 py-3 transition-all hover:bg-primary-blue"
      >
        <svg
          class="group-hover:text-white"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M21 22H3C2.59 22 2.25 21.66 2.25 21.25C2.25 20.84 2.59 20.5 3 20.5H21C21.41 20.5 21.75 20.84 21.75 21.25C21.75 21.66 21.41 22 21 22Z"
            fill="currentColor"
          />
          <path
            d="M19.0196 3.48C17.0796 1.54 15.1796 1.49 13.1896 3.48L11.9796 4.69C11.8796 4.79 11.8396 4.95 11.8796 5.09C12.6396 7.74001 14.7596 9.86 17.4096 10.62C17.4496 10.63 17.4896 10.64 17.5296 10.64C17.6396 10.64 17.7396 10.6 17.8196 10.52L19.0196 9.31001C20.0096 8.33001 20.4896 7.38 20.4896 6.42C20.4996 5.43 20.0196 4.47 19.0196 3.48Z"
            fill="currentColor"
          />
          <path
            d="M15.6103 11.53C15.3203 11.39 15.0403 11.25 14.7703 11.09C14.5503 10.96 14.3403 10.82 14.1303 10.67C13.9603 10.56 13.7603 10.4 13.5703 10.24C13.5503 10.23 13.4803 10.17 13.4003 10.09C13.0703 9.81 12.7003 9.45 12.3703 9.05C12.3403 9.03 12.2903 8.96 12.2203 8.87C12.1203 8.75 11.9503 8.55 11.8003 8.32C11.6803 8.17 11.5403 7.95 11.4103 7.73C11.2503 7.46 11.1103 7.19 10.9703 6.91C10.9491 6.86461 10.9286 6.81944 10.9088 6.77454C10.7612 6.44122 10.3265 6.34378 10.0688 6.60153L4.34032 12.33C4.21032 12.46 4.09032 12.71 4.06032 12.88L3.52032 16.71C3.42032 17.39 3.61032 18.03 4.03032 18.46C4.39032 18.81 4.89032 19 5.43032 19C5.55032 19 5.67032 18.99 5.79032 18.97L9.63032 18.43C9.81032 18.4 10.0603 18.28 10.1803 18.15L15.9016 12.4287C16.1612 12.1691 16.0633 11.7237 15.7257 11.5796C15.6877 11.5634 15.6492 11.5469 15.6103 11.53Z"
            fill="currentColor"
          />
        </svg>
        <span class="hidden group-hover:block group-hover:text-white">
          Edit
        </span>
      </button>
    </div>

    <div class="flex items-center rounded-full bg-white/90">
      <button
        click="handleCancel"
        title="Cancel"
        class="flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent hover:bg-red-500 hover:text-white p-2 text-red-500 transition-colors"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M18 6L6 18M6 6L18 18"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";

const debugMode = ref(false);
const debugInfo = ref({
  windowSize: { width: 0, height: 0 },
  timestamp: new Date().toISOString(),
  platform: navigator.platform,
});

const updateDebugInfo = () => {
  debugInfo.value = {
    windowSize: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    timestamp: new Date().toISOString(),
    platform: navigator.platform,
    userAgent: navigator.userAgent,
  };
};

const closeWindow = () => {
  window.electronWindows.closeWindow("design");
};

const refreshView = () => {
  window.location.reload();
};

const toggleDebug = () => {
  debugMode.value = !debugMode.value;
  if (debugMode.value) {
    updateDebugInfo();
  }
};

onMounted(() => {
  updateDebugInfo();

  // Update debug info on window resize
  window.addEventListener("resize", updateDebugInfo);
});
</script>
