<template>
  <!-- Custom Home Content: Full Page Mode -->
  <div v-if="homeContent" class="min-h-screen">
    <!-- iframe mode -->
    <iframe
      v-if="isHomeContentUrl"
      :src="homeContent.trim()"
      class="h-screen w-full border-0"
      allowfullscreen
    ></iframe>
    <!-- HTML mode - SECURITY: homeContent is admin-only setting, XSS risk is acceptable -->
    <div v-else v-html="homeContent"></div>
  </div>


<!-- Default Home Page -->
  <div id="home-view" v-else>
    <header class="site-header">
      <div class="container nav">
        <a class="brand" href="#top">
          <div class="brand-logo">
            <img :src="siteLogo || '/logo.png'" alt="PYTHAGORAS Logo" />
          </div>
          <div>
            <strong>PYTHAGORAS</strong>
            <span>{{ t('home.globalGateWay') }}</span>
          </div>
        </a>
        <nav class="nav-links">
          <a href="#features">{{ t('home.navFeatures') }}</a>
          <a href="#models">{{ t('home.navModels') }}</a>
          <a href="#workflow">{{ t('home.navWorkflow') }}</a>
        </nav>
        <div class="nav-actions">
            <LocaleSwitcher />
          <!--登录了到  dashboardPath-->
          <a class="btn btn-primary" v-if="isAuthenticated" @click="goToDashboard">
            <span
              class="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-[10px] font-semibold text-white"
            >
              {{ userInitial }}
            </span>
            <span class="text-xs font-medium text-white">{{
              t("home.dashboard")
            }}</span>
            <svg
              class="h-3 w-3 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
              />
            </svg>
          </a>
          <!--没登录到login-->
          <a class="btn btn-primary" v-else @click="gotoLogin">{{ t('home.getApiKey') }}</a>
          <a class="btn btn-secondary" @click="gotoDoc">{{ t('home.viewDocs') }}</a>
        </div>
      </div>
    </header>

    <main id="top">
      <section class="hero">
        <div class="container hero-grid">
          <div class="hero-copy">
            <div class="badge">{{ t('home.heroBadge') }}</div>
            <h1>
              A premium <span class="gradient-text">AI gateway</span><br />
              for global model routing<br />
              and <span class="gradient-text">Coding Plan</span> solutions.
            </h1>
            <p>{{ t('home.heroParagraph') }}</p>
            <div class="hero-actions">
               <router-link
                :to="isAuthenticated ? dashboardPath : '/login'"
                class="btn btn-primary px-8 py-3 text-base shadow-lg shadow-primary-500/30"
              >
                {{ isAuthenticated ? t('home.goToDashboard') : t('home.getStarted') }}
                <Icon name="arrowRight" size="md" class="ml-2" :stroke-width="2" />
              </router-link>
              <a class="btn btn-secondary" href="#features">{{ t('home.viewCapabilities') }}</a>
            </div>
            <div class="hero-meta">
              <div class="meta-card">
                <strong>{{ t('home.metaUnifiedTitle') }}</strong>
                <span>{{ t('home.metaUnifiedDesc') }}</span>
              </div>
              <div class="meta-card">
                <strong>{{ t('home.metaStableTitle') }}</strong>
                <span>{{ t('home.metaStableDesc') }}</span>
              </div>
              <div class="meta-card">
                <strong>Coding Plan</strong>
                <span>{{ t('home.metaCodingDesc') }}</span>
              </div>
            </div>
          </div>

          <div class="hero-visual">
            <div class="visual-shell"></div>

            <div class="floating-card card-a">
              <small>{{ t('home.cardModelRouting') }}</small>
              <strong>{{ t('home.cardMoreModels') }}</strong>
              <div class="chip-row">
                <span class="chip">{{ t('home.chipFailover') }}</span>
                <span class="chip">{{ t('home.chipLoadBalance') }}</span>
                <span class="chip">{{ t('home.chipQuota') }}</span>
              </div>
            </div>

            <div class="floating-card card-b">
              <small>Coding Plan</small>
              <strong>{{ t('home.cardOptimizedDesc') }}</strong>
            </div>

            <div class="floating-card card-c">
              <small>{{ t('home.cardUpstreamStatus') }}</small>
              <div class="signal-list">
                <div class="signal">
                  <span>Claude</span>
                  <div class="signal-line" style="--w: 92%"></div>
                </div>
                <div class="signal">
                  <span>GPT</span>
                  <div class="signal-line" style="--w: 88%"></div>
                </div>
                <div class="signal">
                  <span>Gemini</span>
                  <div class="signal-line" style="--w: 84%"></div>
                </div>
              </div>
            </div>

            <div class="floating-card card-d">
              <small>{{ t('home.cardDevExperience') }}</small>
              <strong>{{ t('home.cardDevExperienceDesc') }}</strong>
            </div>

            <div class="center-panel">
              <div class="center-top">
                <div class="center-logo">
                  <img :src="siteLogo || '/logo.png'" alt="PYTHAGORAS logo" />
                </div>
                <div>
                  <strong>PYTHAGORAS</strong>
                  <span>{{ t('home.consoleTitle') }}</span>
                </div>
              </div>
              <div class="terminal">
                <div class="terminal-bar"><i></i><i></i><i></i></div>
                <code
                  >$ curl https://api.pythagoras.ai/v1/chat/completions # route:
                  auto / upstream: claude # coding-plan: enabled # session:
                  persistent { "status": "ok", "latency": "stable", "output":
                  "ready" }</code
                >
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="section" id="features">
        <div class="container">
          <div class="section-head">
            <div class="label">{{ t('home.coreAdvantagesLabel') }}</div>
            <h2>{{ t('home.coreAdvantagesTitle') }}</h2>
            <p>{{ t('home.coreAdvantagesDesc') }}</p>
          </div>
          <div class="grid-3">
            <article class="panel">
              <div class="icon">01</div>
              <h3>{{ t('home.advantageLowBarrierTitle') }}</h3>
              <p>{{ t('home.advantageLowBarrierDesc') }}</p>
            </article>
            <article class="panel">
              <div class="icon">02</div>
              <h3>{{ t('home.advantageLowerCostTitle') }}</h3>
              <p>{{ t('home.advantageLowerCostDesc') }}</p>
            </article>
            <article class="panel">
              <div class="icon">03</div>
              <h3>{{ t('home.advantageReliableTitle') }}</h3>
              <p>{{ t('home.advantageReliableDesc') }}</p>
            </article>
            <article class="panel">
              <div class="icon">04</div>
              <h3>{{ t('home.advantageDevFriendlyTitle') }}</h3>
              <p>{{ t('home.advantageDevFriendlyDesc') }}</p>
            </article>
            <article class="panel">
              <div class="icon">05</div>
              <h3>{{ t('home.advantageRichScenariosTitle') }}</h3>
              <p>{{ t('home.advantageRichScenariosDesc') }}</p>
            </article>
            <article class="panel">
              <div class="icon">06</div>
              <h3>{{ t('home.advantageEnterpriseControlTitle') }}</h3>
              <p>{{ t('home.advantageEnterpriseControlDesc') }}</p>
            </article>
          </div>
        </div>
      </section>

      <section class="section" id="models">
        <div class="container">
          <div class="section-head">
            <div class="label">{{ t('home.navModels') }}</div>
            <h2>{{ t('home.modelsTitle') }}</h2>
            <p>{{ t('home.modelsDesc') }}</p>
          </div>
          <div class="grid-3">
            <article class="panel">
              <div class="icon">Cl</div>
              <h3>{{ t('home.modelsClaudeTitle') }}</h3>
              <p>{{ t('home.modelsClaudeDesc') }}</p>
            </article>
            <article class="panel">
              <div class="icon">GP</div>
              <h3>{{ t('home.modelsGptTitle') }}</h3>
              <p>{{ t('home.modelsGptDesc') }}</p>
            </article>
            <article class="panel">
              <div class="icon">Ge</div>
              <h3>{{ t('home.modelsGeminiTitle') }}</h3>
              <p>{{ t('home.modelsGeminiDesc') }}</p>
            </article>
          </div>
        </div>
      </section>

      <section class="section" id="workflow" style="padding-top: 8px">
        <div class="container">
          <div class="section-head">
            <div class="label">{{ t('home.navWorkflow') }}</div>
            <h2>{{ t('home.workflowTitle') }}</h2>
            <p>{{ t('home.workflowDesc') }}</p>
          </div>
          <div class="process-grid">
            <article class="process">
              <div class="icon">01</div>
              <h3>{{ t('home.workflowStepGetKeyTitle') }}</h3>
              <p>{{ t('home.workflowStepGetKeyDesc') }}</p>
            </article>
            <article class="process">
              <div class="icon">02</div>
              <h3>{{ t('home.workflowStepConfigRouteTitle') }}</h3>
              <p>{{ t('home.workflowStepConfigRouteDesc') }}</p>
            </article>
            <article class="process">
              <div class="icon">03</div>
              <h3>{{ t('home.workflowStepIntegrateTitle') }}</h3>
              <p>{{ t('home.workflowStepIntegrateDesc') }}</p>
            </article>
            <article class="process">
              <div class="icon">04</div>
              <h3>{{ t('home.workflowStepScaleTitle') }}</h3>
              <p>{{ t('home.workflowStepScaleDesc') }}</p>
            </article>
          </div>
        </div>
      </section>

      <section class="section" style="padding-top: 8px">
        <div class="container">
          <div class="cta">
            <div>
              <h2>Redesigned for trust,<br />built for developers.</h2>
              <p>{{ t('home.ctaDesc') }}</p>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="container footer-inner">
        <span>{{ t('home.footerCopyright') }}</span>
        <span class="footer-icp">{{ t('home.footerIcp') }}</span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useAuthStore, useAppStore } from "@/stores";
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'

import router from "@/router";

const { t } = useI18n();

const authStore = useAuthStore();
const appStore = useAppStore();



localStorage.setItem("theme", "light");

// Site settings - directly from appStore (already initialized from injected config)
const siteLogo = computed(
  () => appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || "",
);
const docUrl = computed(
  () => appStore.cachedPublicSettings?.doc_url || appStore.docUrl || 'https://aidoc.zhisales.com/',
);
const homeContent = computed(
  () => appStore.cachedPublicSettings?.home_content || "",
);

// Check if homeContent is a URL (for iframe display)
const isHomeContentUrl = computed(() => {
  const content = homeContent.value.trim();
  return content.startsWith("http://") || content.startsWith("https://");
});

// Theme
const isDark = ref(document.documentElement.classList.contains("dark"));

// Auth state
const isAuthenticated = computed(() => authStore.isAuthenticated);
const isAdmin = computed(() => authStore.isAdmin)
const dashboardPath = computed(() => isAdmin.value ? '/admin/dashboard' : '/dashboard')
const userInitial = computed(() => {
  const user = authStore.user;
  if (!user || !user.email) return "";
  return user.email.charAt(0).toUpperCase();
});

// Current year for footer
// const currentYear = computed(() => new Date().getFullYear())



// goToDashboard
function goToDashboard() {
  router.push(dashboardPath.value);
}

//gotoLogin
function gotoLogin(){
    router.push('/login')
}

//gotoDoc
function gotoDoc() {
  window.open(docUrl.value, '_blank', 'noopener,noreferrer');
}
// Initialize theme
function initTheme() {
  const savedTheme = localStorage.getItem("theme");
  if (
    savedTheme === "dark" ||
    (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    isDark.value = true;
    document.documentElement.classList.add("dark");
  }
}

onMounted(() => {
  initTheme();

  // Check auth state
  authStore.checkAuth();

  // Ensure public settings are loaded (will use cache if already loaded from injected config)
  if (!appStore.publicSettingsLoaded) {
    appStore.fetchPublicSettings();
  }
});
</script>

<style scoped>
#home-view {
  --bg: #f7f9ff;
  --bg-soft: #eef4ff;
  --panel: rgba(255, 255, 255, 0.78);
  --panel-strong: #ffffff;
  --text: #0f1b33;
  --text-2: #34486b;
  --text-3: #6b7f9f;
  --line: rgba(58, 93, 162, 0.12);
  --blue: #2563ff;
  --cyan: #00c2ff;
  --violet: #735cff;
  --mint: #1bd8b4;
  --shadow-lg: 0 28px 70px rgba(38, 75, 148, 0.14);
  --shadow-md: 0 18px 42px rgba(34, 74, 136, 0.08);
  --max: 1220px;

  margin: 0;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    "PingFang SC",
    "Hiragino Sans GB",
    "Microsoft YaHei",
    sans-serif;
  color: var(--text);
  line-height: 1.6;
  background:
    radial-gradient(circle at 10% 8%, rgba(37, 99, 255, 0.14), transparent 24%),
    radial-gradient(
      circle at 88% 10%,
      rgba(0, 194, 255, 0.12),
      transparent 20%
    ),
    radial-gradient(
      circle at 78% 32%,
      rgba(115, 92, 255, 0.1),
      transparent 22%
    ),
    linear-gradient(180deg, #fcfdff 0%, #f6f9ff 48%, #f8fbff 100%);
  height: 100vh;
  overflow-y: auto;
  scroll-behavior: smooth;
}

#home-view * {
  box-sizing: border-box;
}

a {
  color: inherit;
  text-decoration: none;
}
img {
  display: block;
  max-width: 100%;
}

.container {
  width: min(calc(100% - 40px), var(--max));
  margin: 0 auto;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 50;
  backdrop-filter: blur(18px);
  background: rgba(255, 255, 255, 0.72);
  border-bottom: 1px solid rgba(73, 113, 184, 0.08);
}

.nav {
  min-height: 78px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.brand-logo {
  width: 58px;
  height: 58px;
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
  flex: 0 0 58px;
}

.brand strong {
  display: block;
  font-size: 15px;
  letter-spacing: 0.08em;
}

.brand span {
  display: block;
  font-size: 12px;
  letter-spacing: 0.16em;
  color: var(--text-3);
  text-transform: uppercase;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 28px;
  color: var(--text-2);
  font-size: 14px;
}

.nav-links a:hover {
  color: var(--blue);
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 22px;
  border-radius: 999px;
  font-weight: 700;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.btn:hover {
  transform: translateY(-1px);
}

.btn-primary {
  color: #fff;
  background: linear-gradient(135deg, var(--blue), var(--cyan));
  box-shadow: 0 16px 34px rgba(37, 99, 255, 0.22);
}

.btn-secondary {
  color: #274675;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(72, 112, 183, 0.12);
  box-shadow: 0 12px 28px rgba(43, 84, 151, 0.08);
}

.hero {
  position: relative;
  overflow: hidden;
  padding: 48px 0 64px;
}

.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(420px, 0.95fr);
  gap: 44px;
  align-items: center;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(72, 112, 183, 0.1);
  color: #335a93;
  font-size: 12px;
  box-shadow: 0 12px 28px rgba(44, 82, 145, 0.08);
  margin-bottom: 20px;
}

.badge::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--blue), var(--cyan));
  box-shadow: 0 0 14px rgba(37, 99, 255, 0.4);
}
h1, h2, h3, h4, h5, h6{
  font-weight: revert;
}
h1 {
  margin: 0;
  font-size: clamp(36px, 5.6vw, 58px);
  line-height: 1.02;
  letter-spacing: -0.05em;
  color: #0c1a31;
}

.gradient-text {
  background: linear-gradient(135deg, #175bff, #00bfff 56%, #6f5cff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero-copy p {
  margin: 22px 0 0;
  max-width: 720px;
  font-size: 18px;
  color: var(--text-2);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 30px;
}

.hero-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 34px;
}

.meta-card {
  padding: 16px 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(72, 112, 183, 0.1);
  box-shadow: 0 16px 32px rgba(44, 82, 145, 0.08);
}

.meta-card strong {
  display: block;
  margin-bottom: 6px;
  font-size: 15px;
  color: #16386a;
}

.meta-card span {
  font-size: 13px;
  color: var(--text-3);
}

.hero-visual {
  position: relative;
  min-height: 640px;
}

.visual-shell {
  position: absolute;
  inset: 24px 0 20px 0;
  border-radius: 36px;
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.82),
      rgba(244, 248, 255, 0.72)
    ),
    radial-gradient(
      circle at top right,
      rgba(115, 92, 255, 0.14),
      transparent 28%
    ),
    radial-gradient(
      circle at bottom left,
      rgba(0, 194, 255, 0.1),
      transparent 24%
    );
  border: 1px solid rgba(72, 112, 183, 0.12);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.visual-shell::before {
  content: "";
  position: absolute;
  width: 460px;
  height: 460px;
  border-radius: 50%;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -46%);
  border: 1px solid rgba(87, 124, 192, 0.12);
}

.visual-shell::after {
  content: "";
  position: absolute;
  width: 340px;
  height: 340px;
  border-radius: 50%;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -46%);
  border: 1px dashed rgba(87, 124, 192, 0.18);
  background: radial-gradient(
    circle,
    rgba(37, 99, 255, 0.08) 0%,
    rgba(37, 99, 255, 0) 68%
  );
}

.center-panel {
  position: absolute;
  z-index: 2;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 290px;
  padding: 24px;
  border-radius: 30px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.96),
    rgba(242, 247, 255, 0.9)
  );
  border: 1px solid rgba(76, 117, 188, 0.12);
  box-shadow: 0 24px 54px rgba(40, 84, 149, 0.14);
}

.center-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.center-logo {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  padding: 8px;
  background: linear-gradient(180deg, #fff, #eef5ff);
  box-shadow:
    0 10px 24px rgba(44, 82, 145, 0.12),
    inset 0 0 0 1px rgba(72, 112, 183, 0.08);
}

.center-top strong {
  display: block;
  font-size: 17px;
  letter-spacing: 0.08em;
}

.center-top span {
  display: block;
  font-size: 12px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.terminal {
  padding: 18px;
  border-radius: 22px;
  color: #dff0ff;
  background: linear-gradient(180deg, #081425, #0e1d33);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.terminal-bar {
  display: flex;
  gap: 7px;
  margin-bottom: 14px;
}

.terminal-bar i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: block;
  background: #ff6b6b;
}

.terminal-bar i:nth-child(2) {
  background: #ffd166;
}
.terminal-bar i:nth-child(3) {
  background: #06d6a0;
}

.terminal code {
  display: block;
  white-space: pre-line;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
  color: #d8edff;
}

.floating-card {
  position: absolute;
  z-index: 3;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(72, 112, 183, 0.1);
  box-shadow: 0 20px 48px rgba(41, 81, 145, 0.12);
  backdrop-filter: blur(14px);
}

.floating-card small {
  display: block;
  color: var(--text-3);
  font-size: 12px;
  margin-bottom: 7px;
}

.floating-card strong {
  display: block;
  color: #173866;
  line-height: 1.24;
}

.card-a {
  top: 12px;
  right: 10px;
  width: 220px;
  padding: 18px;
  border-radius: 22px;
}

.card-b {
  left: 8px;
  top: 126px;
  width: 210px;
  padding: 18px;
  border-radius: 22px;
}

.card-c {
  left: 40px;
  bottom: 58px;
  width: 230px;
  padding: 20px;
  border-radius: 24px;
}

.card-d {
  right: 24px;
  bottom: 90px;
  width: 230px;
  padding: 20px;
  border-radius: 24px;
}

.signal-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.signal {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #345371;
}

.signal-line {
  height: 8px;
  border-radius: 999px;
  background: rgba(37, 99, 255, 0.08);
  position: relative;
  overflow: hidden;
}

.signal-line::after {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--w, 70%);
  border-radius: inherit;
  background: linear-gradient(90deg, var(--blue), var(--cyan));
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.chip {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(37, 99, 255, 0.08);
  color: #2957a2;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid rgba(37, 99, 255, 0.08);
}

.section {
  padding: 92px 0;
}

.section-head {
  max-width: 760px;
  margin-bottom: 38px;
}

.label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--blue);
  font-size: 13px;
  text-transform: uppercase;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.label::before {
  content: "";
  width: 28px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--blue), var(--cyan));
}

.section-head h2 {
  margin: 0;
  font-size: clamp(30px, 4vw, 46px);
  line-height: 1.12;
  letter-spacing: -0.03em;
}

.section-head p {
  margin: 16px 0 0;
  font-size: 17px;
  color: var(--text-3);
}

.grid-4,
.grid-3,
.grid-2 {
  display: grid;
  gap: 22px;
}

.grid-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.grid-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.grid-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.panel {
  position: relative;
  overflow: hidden;
  padding: 30px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(72, 112, 183, 0.1);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(12px);
}

.panel::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 4px;
  background: linear-gradient(90deg, var(--blue), var(--cyan), var(--violet));
  opacity: 0.84;
}

.icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: var(--blue);
  background: linear-gradient(
    180deg,
    rgba(37, 99, 255, 0.12),
    rgba(0, 194, 255, 0.08)
  );
  box-shadow: inset 0 0 0 1px rgba(72, 112, 183, 0.08);
  margin-bottom: 18px;
}

.panel h3 {
  margin: 0 0 12px;
  font-size: 22px;
  line-height: 1.2;
}

.panel p {
  margin: 0;
  color: var(--text-2);
  font-size: 15px;
}

.panel ul {
  margin: 16px 0 0;
  padding-left: 18px;
  color: #46627e;
  font-size: 14px;
}

.panel ul li + li {
  margin-top: 8px;
}

.split {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 24px;
  align-items: stretch;
}

.premium {
  padding: 36px;
  border-radius: 32px;
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.84),
      rgba(244, 248, 255, 0.76)
    ),
    radial-gradient(
      circle at top right,
      rgba(115, 92, 255, 0.14),
      transparent 30%
    ),
    radial-gradient(
      circle at bottom left,
      rgba(0, 194, 255, 0.1),
      transparent 24%
    );
  border: 1px solid rgba(72, 112, 183, 0.1);
  box-shadow: var(--shadow-lg);
}

.premium h3 {
  margin: 0 0 14px;
  font-size: 30px;
  line-height: 1.15;
}

.premium p {
  margin: 0;
  color: var(--text-2);
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 28px;
}

.stat {
  padding: 20px 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(72, 112, 183, 0.1);
  box-shadow: 0 12px 24px rgba(44, 82, 145, 0.06);
}

.stat strong {
  display: block;
  font-size: 30px;
  line-height: 1;
  color: #163767;
  margin-bottom: 8px;
}

.stat span {
  color: var(--text-3);
  font-size: 13px;
}

.process-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.process {
  padding: 26px 22px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(72, 112, 183, 0.1);
  box-shadow: var(--shadow-md);
}

.process h3 {
  margin: 14px 0 10px;
  font-size: 18px;
}

.process p {
  margin: 0;
  color: var(--text-2);
  font-size: 14px;
}

.cta {
  padding: 42px;
  border-radius: 34px;
  background:
    linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.84),
      rgba(239, 246, 255, 0.76)
    ),
    radial-gradient(
      circle at left center,
      rgba(37, 99, 255, 0.12),
      transparent 24%
    ),
    radial-gradient(
      circle at right center,
      rgba(0, 194, 255, 0.1),
      transparent 22%
    );
  border: 1px solid rgba(72, 112, 183, 0.1);
  box-shadow: var(--shadow-lg);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}

.cta h2 {
  margin: 0;
  font-size: clamp(30px, 4vw, 48px);
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.cta p {
  margin: 12px 0 0;
  color: var(--text-2);
  max-width: 760px;
}

.footer {
  padding: 28px 0 48px;
  color: #6d80a0;
  font-size: 13px;
}

.footer-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  border-top: 1px solid rgba(72, 112, 183, 0.1);
  padding-top: 24px;
}

.footer-icp {
  font-size: 12px;
  color: #90a0b8;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .hero-grid,
  .split,
  .grid-4,
  .grid-3,
  .grid-2,
  .process-grid {
    grid-template-columns: 1fr 1fr;
  }
  .stats {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 860px) {
  .nav {
    flex-wrap: wrap;
    padding: 14px 0;
  }
  .nav-links {
    order: 3;
    width: 100%;
    justify-content: space-between;
    overflow-x: auto;
    gap: 14px;
    padding-bottom: 6px;
  }
  .hero-grid,
  .split,
  .grid-4,
  .grid-3,
  .grid-2,
  .hero-meta,
  .stats,
  .process-grid {
    grid-template-columns: 1fr;
  }
  .hero-visual {
    min-height: 560px;
  }
  .visual-shell {
    inset: 20px 0;
  }
  .card-a,
  .card-b,
  .card-c,
  .card-d {
    width: 180px;
    padding: 16px;
  }
  .card-a {
    right: 0;
  }
  .card-b {
    left: 0;
  }
  .card-c {
    left: 12px;
    bottom: 40px;
  }
  .card-d {
    right: 0;
    bottom: 66px;
  }
  .cta,
  .footer-inner {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
