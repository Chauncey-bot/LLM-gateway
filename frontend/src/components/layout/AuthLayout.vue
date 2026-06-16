<template>
  <div
    class="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
    :class="isAdLayout ? 'auth-ad-layout lg:justify-end lg:p-10' : ''"
  >
    <template v-if="isAdLayout">
      <div class="absolute inset-0 bg-slate-950 auth-ad-placeholder"></div>
      <img
        :src="resolvedBackgroundImage"
        :srcset="resolvedBackgroundSrcset || undefined"
        sizes="100vw"
        alt=""
        class="absolute inset-0 h-full w-full object-cover"
        fetchpriority="high"
        decoding="async"
        loading="eager"
        aria-hidden="true"
      />
      <div class="absolute inset-0 bg-slate-950/45"></div>
      <div class="absolute inset-y-0 right-0 hidden w-1/2 bg-gradient-to-l from-slate-950/65 to-transparent lg:block"></div>
    </template>

    <!-- Background -->
    <div
      v-else
      class="absolute inset-0 bg-gradient-to-br from-gray-50 via-primary-50/30 to-gray-100 dark:from-dark-950 dark:via-dark-900 dark:to-dark-950"
    ></div>

    <div v-if="$slots.actions" class="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
      <slot name="actions" />
    </div>

    <!-- Decorative Elements -->
    <div v-if="!isAdLayout" class="pointer-events-none absolute inset-0 overflow-hidden">
      <!-- Gradient Orbs -->
      <div
        class="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-primary-400/20 blur-3xl"
      ></div>
      <div
        class="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary-500/15 blur-3xl"
      ></div>
      <div
        class="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-300/10 blur-3xl"
      ></div>

      <!-- Grid Pattern -->
      <div
        class="absolute inset-0 bg-[linear-gradient(rgba(20,184,166,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(20,184,166,0.03)_1px,transparent_1px)] bg-[size:64px_64px]"
      ></div>
    </div>

    <!-- Content Container -->
    <div
      v-if="isAdLayout"
      class="pointer-events-none relative z-10 mr-auto hidden max-w-xl text-white lg:block"
    >
      <p class="text-sm font-semibold uppercase tracking-[0.3em] text-white/70">{{ siteName }}</p>
      <h1 class="mt-5 text-5xl font-semibold leading-tight tracking-tight xl:text-6xl">
        {{ siteSubtitle }}
      </h1>
    </div>

    <div class="relative z-10 w-full max-w-md">
      <!-- Logo/Brand -->
      <div class="mb-8 text-center" :class="isAdLayout ? 'text-white' : ''">
        <!-- Custom Logo or Default Logo -->
        <template v-if="settingsLoaded">
          <div
            class="mb-4 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl shadow-lg shadow-primary-500/30"
            :class="isAdLayout ? 'border border-white/20 bg-white/90' : ''"
          >
            <img :src="siteLogo || '/logo.png'" alt="Logo" class="h-full w-full object-contain" />
          </div>
          <h1 class="mb-2 text-3xl font-bold" :class="isAdLayout ? 'text-white' : 'text-gradient'">
            {{ siteName }}
          </h1>
          <p class="text-sm" :class="isAdLayout ? 'text-white/75' : 'text-gray-500 dark:text-dark-400'">
            {{ siteSubtitle }}
          </p>
        </template>
      </div>

      <!-- Card Container -->
      <div
        class="rounded-2xl p-8"
        :class="[
          isAdLayout ? 'auth-ad-card shadow-2xl shadow-slate-950/30' : 'card-glass shadow-glass',
          cardClass
        ]"
      >
        <slot />
      </div>

      <!-- Footer Links -->
      <div class="mt-6 text-center text-sm">
        <slot name="footer" />
      </div>

      <!-- Copyright -->
      <div class="mt-8 text-center text-xs" :class="isAdLayout ? 'text-white/65' : 'text-gray-400 dark:text-dark-500'">
        &copy; {{ currentYear }} {{ siteName }}. All rights reserved.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAppStore } from '@/stores'
import { sanitizeUrl } from '@/utils/url'

const props = withDefaults(defineProps<{
  variant?: 'default' | 'ad'
  backgroundImage?: string
  cardClass?: string
}>(), {
  variant: 'default',
  backgroundImage: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1440&q=70',
  cardClass: ''
})

const appStore = useAppStore()

const siteName = computed(() => 'PYTHAGORAS')
const siteLogo = computed(() => sanitizeUrl(appStore.siteLogo || '', { allowRelative: true, allowDataUrl: true }))
const siteSubtitle = computed(() => appStore.cachedPublicSettings?.site_subtitle || 'Subscription to API Conversion Platform')
const settingsLoaded = computed(() => appStore.publicSettingsLoaded)
const isAdLayout = computed(() => props.variant === 'ad')
const resolvedBackgroundImage = computed(() => sanitizeUrl(props.backgroundImage, { allowRelative: true }))
const resolvedBackgroundSrcset = computed(() => buildImageSrcset(resolvedBackgroundImage.value))

const currentYear = computed(() => new Date().getFullYear())

onMounted(() => {
  if (isAdLayout.value) {
    preconnectToImageOrigin(resolvedBackgroundImage.value)
    preloadImage(resolvedBackgroundImage.value, resolvedBackgroundSrcset.value)
  }
  appStore.fetchPublicSettings()
})

function buildImageSrcset(imageUrl: string): string {
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) return ''

  try {
    const url = new URL(imageUrl)
    if (!url.hostname.includes('unsplash.com')) return ''

    return [960, 1440, 1920]
      .map((width) => {
        const candidate = new URL(url)
        candidate.searchParams.set('auto', 'format')
        candidate.searchParams.set('fit', 'crop')
        candidate.searchParams.set('w', String(width))
        candidate.searchParams.set('q', '70')
        return `${candidate.toString()} ${width}w`
      })
      .join(', ')
  } catch {
    return ''
  }
}

function preconnectToImageOrigin(imageUrl: string): void {
  if (typeof document === 'undefined') return

  try {
    const origin = new URL(imageUrl, window.location.href).origin
    const existing = document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)
    if (existing) return

    const link = document.createElement('link')
    link.rel = 'preconnect'
    link.href = origin
    link.crossOrigin = ''
    document.head.appendChild(link)
  } catch {
    // Ignore invalid custom URLs; sanitizeUrl still protects the rendered src.
  }
}

function preloadImage(imageUrl: string, srcset: string): void {
  if (typeof document === 'undefined' || !imageUrl) return

  const existing = document.head.querySelector(`link[rel="preload"][href="${imageUrl}"]`)
  if (existing) return

  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'image'
  link.href = imageUrl
  if (srcset) {
    link.setAttribute('imagesrcset', srcset)
    link.setAttribute('imagesizes', '100vw')
  }
  document.head.appendChild(link)
}
</script>

<style scoped>
.text-gradient {
  @apply bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent;
}

.auth-ad-layout {
  background-color: #020617;
}

.auth-ad-placeholder {
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 64, 175, 0.58)),
    radial-gradient(circle at 22% 24%, rgba(45, 212, 191, 0.18), transparent 32%),
    #020617;
}

.auth-ad-card {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(22px);
}

:global(.dark) .auth-ad-card {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(15, 23, 42, 0.82);
}
</style>
