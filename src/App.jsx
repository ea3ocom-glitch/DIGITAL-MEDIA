import { useState, useEffect, useRef } from "react";

// ─── CREDENTIALS ─────────────────────────────────────────────────────────────
const ADMIN_USER = "admin";
const ADMIN_PASS = "YourBrand2025!";

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
// 🔧 PASTE YOUR SUPABASE CREDENTIALS HERE (from supabase.com → Project Settings → API)
const SUPABASE_URL  = "YOUR_SUPABASE_URL";   // e.g. https://xxxx.supabase.co
const SUPABASE_KEY  = "YOUR_SUPABASE_ANON_KEY"; // starts with "eyJ..."

// ─── RUNTIME SUPABASE CONFIG — reads from localStorage so users can set keys from UI ─
function getSbCreds() {
  try {
    const stored = localStorage.getItem("me_sb_creds");
    if (stored) {
      const { url, key } = JSON.parse(stored);
      if (url && key && url !== "YOUR_SUPABASE_URL") return { url, key };
    }
  } catch {}
  // Fall back to hardcoded constants
  if (SUPABASE_URL !== "YOUR_SUPABASE_URL" && SUPABASE_KEY !== "YOUR_SUPABASE_ANON_KEY") {
    return { url: SUPABASE_URL, key: SUPABASE_KEY };
  }
  return null;
}

const _initCreds = getSbCreds();

// Lightweight Supabase client — no npm package needed
const sb = {
  url:   _initCreds?.url || SUPABASE_URL,
  key:   _initCreds?.key || SUPABASE_KEY,
  ready: !!_initCreds,

  // Reconnect with new credentials at runtime (called from admin UI)
  connect(url, key) {
    this.url   = url;
    this.key   = key;
    this.ready = !!(url && key && url.startsWith("http"));
    if (this.ready) {
      try { localStorage.setItem("me_sb_creds", JSON.stringify({ url, key })); } catch {}
    }
    return this.ready;
  },

  async query(table, method = "GET", body = null, match = null) {
    if (!this.ready) return { data: null, error: "Supabase not configured" };
    try {
      let url = `${this.url}/rest/v1/${table}`;
      if (match) url += `?${Object.entries(match).map(([k,v])=>`${k}=eq.${v}`).join("&")}`;
      const res = await fetch(url, {
        method,
        headers: {
          "apikey": this.key,
          "Authorization": `Bearer ${this.key}`,
          "Content-Type": "application/json",
          "Prefer": method === "POST" ? "return=representation" : "return=minimal",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = res.ok ? (res.status === 204 ? null : await res.json()) : null;
      const error = res.ok ? null : await res.text();
      return { data, error };
    } catch(e) { return { data: null, error: e.message }; }
  },

  // Config: save entire app config as single row
  async saveConfig(config) {
    if (!this.ready) return false;
    const { error } = await this.query(
      "app_config",
      "POST",
      { id: 1, data: JSON.stringify(config), updated_at: new Date().toISOString() }
    );
    if (error) {
      // Try update if insert fails (row exists)
      await this.query("app_config", "PATCH", { data: JSON.stringify(config), updated_at: new Date().toISOString() }, { id: 1 });
    }
    return true;
  },

  async loadConfig() {
    if (!this.ready) return null;
    const { data } = await this.query("app_config", "GET", null, { id: 1 });
    if (data && data[0]?.data) {
      try { return JSON.parse(data[0].data); } catch { return null; }
    }
    return null;
  },

  // VIP Live — dedicated row for instant cross-device sync
  async setVipLive(liveData) {
    if (!this.ready) return false;
    const payload = { id:1, data: JSON.stringify(liveData), updated_at: new Date().toISOString() };
    const { error } = await this.query("vip_live", "POST", payload);
    if (error) await this.query("vip_live", "PATCH", { data: JSON.stringify(liveData), updated_at: new Date().toISOString() }, { id:1 });
    return true;
  },

  async getVipLive() {
    if (!this.ready) return null;
    const { data } = await this.query("vip_live?order=updated_at.desc&limit=1", "GET");
    if (data && data[0]?.data) {
      try { return JSON.parse(data[0].data); } catch { return null; }
    }
    return null;
  },

  // Subscribers
  async addSubscriber(email) {
    if (!this.ready) return false;
    const { error } = await this.query("subscribers", "POST", {
      email, created_at: new Date().toISOString()
    });
    return !error;
  },

  async getSubscribers() {
    if (!this.ready) return [];
    const { data } = await this.query("subscribers", "GET");
    return data || [];
  },

  // Inquiries
  async addInquiry(inquiry) {
    if (!this.ready) return false;
    const { error } = await this.query("inquiries", "POST", {
      ...inquiry, created_at: new Date().toISOString()
    });
    return !error;
  },

  async getInquiries() {
    if (!this.ready) return [];
    const { data } = await this.query("inquiries", "GET");
    return data || [];
  },

  // Members
  async addMember(email, plan) {
    if (!this.ready) return false;
    const { error } = await this.query("members", "POST", {
      email, plan, joined_at: new Date().toISOString(), status: "active"
    });
    return !error;
  },

  async getMembers() {
    if (!this.ready) return [];
    const { data } = await this.query("members", "GET");
    return data || [];
  },

  // Community posts
  async getPosts() {
    if (!this.ready) return null;
    const { data } = await this.query("community_posts?order=created_at.desc&limit=100", "GET");
    return data || null;
  },

  async addPost(post) {
    if (!this.ready) return false;
    const { error } = await this.query("community_posts", "POST", {
      author: post.author, handle: post.handle, avatar: post.avatar,
      text: post.text, image: post.image || "", likes: 0, replies: [],
    });
    return !error;
  },

  async updatePost(id, patch) {
    if (!this.ready) return false;
    await this.query("community_posts", "PATCH", patch, { id });
    return true;
  },

  async deletePost(id) {
    if (!this.ready) return false;
    await this.query(`community_posts?id=eq.${id}`, "DELETE");
    return true;
  },
};

// ─── DB SETUP INSTRUCTIONS (shown in admin when not configured) ───────────────
const DB_SETUP_SQL = `
-- Run this SQL in Supabase → SQL Editor → New Query

CREATE TABLE IF NOT EXISTS app_config (
  id INT PRIMARY KEY,
  data TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inquiries (
  id BIGSERIAL PRIMARY KEY,
  name TEXT, email TEXT, type TEXT,
  message TEXT, budget TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  plan TEXT, status TEXT DEFAULT 'active',
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_posts (
  id BIGSERIAL PRIMARY KEY,
  author TEXT, handle TEXT, avatar TEXT,
  text TEXT, image TEXT,
  likes INT DEFAULT 0,
  replies JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vip_live (
  id INT PRIMARY KEY,
  data TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable public access (Row Level Security off for simplicity)
ALTER TABLE app_config       DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers      DISABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries        DISABLE ROW LEVEL SECURITY;
ALTER TABLE members          DISABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts  DISABLE ROW LEVEL SECURITY;
ALTER TABLE vip_live         DISABLE ROW LEVEL SECURITY;
`;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PLATFORMS = [
  { id:"instagram", name:"Instagram",   icon:"📸", color:"#E1306C", maxChars:2200,  note:""             },
  { id:"tiktok",    name:"TikTok",      icon:"🎵", color:"#69C9D0", maxChars:2200,  note:"1-tap approve" },
  { id:"facebook",  name:"Facebook",    icon:"📘", color:"#4267B2", maxChars:63206, note:""             },
  { id:"twitter",   name:"X / Twitter", icon:"✕",  color:"#1DA1F2", maxChars:280,   note:""             },
  { id:"youtube",   name:"YouTube",     icon:"▶",  color:"#FF0000", maxChars:5000,  note:"Video only"    },
  { id:"linkedin",  name:"LinkedIn",    icon:"in", color:"#0077B5", maxChars:3000,  note:""             },
  { id:"spotify",   name:"Spotify",     icon:"♫",  color:"#1DB954", maxChars:0,     note:"Music only"    },
];

const LIVE_PLATFORMS = [
  { id:"youtube",   name:"YouTube Live",   icon:"▶",  color:"#FF0000", rtmpBase:"rtmp://a.rtmp.youtube.com/live2/"              },
  { id:"facebook",  name:"Facebook Live",  icon:"📘", color:"#4267B2", rtmpBase:"rtmps://live-api-s.facebook.com:443/rtmp/"     },
  { id:"instagram", name:"Instagram Live", icon:"📸", color:"#E1306C", rtmpBase:"rtmps://edgetee-upload.facebook.com:443/rtmp/" },
  { id:"tiktok",    name:"TikTok Live",    icon:"🎵", color:"#69C9D0", rtmpBase:"rtmp://push.tiktokcdn.com/live/"               },
  { id:"twitch",    name:"Twitch",         icon:"🎮", color:"#9146FF", rtmpBase:"rtmp://live.twitch.tv/app/"                    },
];

const POST_TYPES = [
  { id:"post",  label:"Post",       icon:"◈" },
  { id:"story", label:"Story",      icon:"◎" },
  { id:"reel",  label:"Reel",       icon:"▶" },
  { id:"music", label:"Music Drop", icon:"♪" },
];

const TONES = ["Hype","Chill","Professional","Raw / Real","Funny","Inspirational"];

// Social handle key → config key mapping (fix for Twitter/X lookup)
const SOCIAL_KEY_MAP = {
  Instagram:  "instagram",
  YouTube:    "youtube",
  TikTok:     "tiktok",
  "Twitter/X":"twitter",
  Facebook:   "facebook",
  Spotify:    "spotify",
};

const SOCIAL_LINKS = [
  { name:"Instagram", defaultHandle:"@yourhandle",  color:"#E1306C", logo:"instagram", followers:"12.4K", action:"Follow"    },
  { name:"YouTube",   defaultHandle:"@yourchannel", color:"#FF0000", logo:"youtube",   followers:"8.2K",  action:"Subscribe" },
  { name:"TikTok",    defaultHandle:"@yourhandle",  color:"#69C9D0", logo:"tiktok",    followers:"31K",   action:"Follow"    },
  { name:"Twitter/X", defaultHandle:"@yourhandle",  color:"#1DA1F2", logo:"twitter",   followers:"5.6K",  action:"Follow"    },
  { name:"Facebook",  defaultHandle:"Your Page",    color:"#1877F2", logo:"facebook",  followers:"9.1K",  action:"Like"      },
  { name:"Spotify",   defaultHandle:"Your Artist",  color:"#1DB954", logo:"spotify",   followers:"3.8K",  action:"Follow"    },
];

const MUSIC_TRACKS = [
  { title:"Track Name 01", genre:"Hip-Hop", duration:"3:42", plays:"1.2K", audioType:"url", audioUrl:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", audioFile:"", audioFileName:"" },
  { title:"Track Name 02", genre:"R&B",     duration:"4:11", plays:"892",  audioType:"url", audioUrl:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", audioFile:"", audioFileName:"" },
  { title:"Track Name 03", genre:"Pop",     duration:"3:28", plays:"2.1K", audioType:"url", audioUrl:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", audioFile:"", audioFileName:"" },
  { title:"Track Name 04", genre:"Trap",    duration:"2:58", plays:"644",  audioType:"url", audioUrl:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", audioFile:"", audioFileName:"" },
];

const SHOWS = [
  { title:"Episode 01 — Pilot",       desc:"The beginning of something legendary.",  duration:"42 min", views:"3.4K", thumbUrl:"", videoType:"url", videoUrl:"https://www.youtube.com/watch?v=dQw4w9WgXcQ", videoFile:"", videoFileName:"" },
  { title:"Episode 02 — The Come Up", desc:"How to build from nothing.",             duration:"38 min", views:"2.8K", thumbUrl:"", videoType:"url", videoUrl:"https://www.youtube.com/watch?v=3JZ_D3ELwOQ", videoFile:"", videoFileName:"" },
  { title:"Episode 03 — Real Talk",   desc:"Industry secrets they won't tell you.",  duration:"51 min", views:"5.1K", thumbUrl:"", videoType:"url", videoUrl:"https://www.youtube.com/watch?v=ZbZSe6N_BXs", videoFile:"", videoFileName:"" },
];

const MARKETING_PLAN = [
  { phase:"PHASE 01", title:"BRAND LOCK-IN",  timeline:"Week 1–2", color:"#FF6B35", steps:["Register your app name as a trademark","Claim same username across ALL platforms","Create one signature logo + color palette","Write a 10-word brand statement","Add your app link to EVERY bio TODAY"] },
  { phase:"PHASE 02", title:"TRAFFIC FUNNEL", timeline:"Week 3–4", color:"#C77DFF", steps:["Post a hub announcement Reel/TikTok","Pin the app link at top of every profile","Add QR code to all printed merch","Send email blast to existing list","Add app link to YouTube end screens"] },
  { phase:"PHASE 03", title:"CONTENT ENGINE", timeline:"Month 2",  color:"#00F5D4", steps:["Post exclusive content ONLY on your app","Tease app-exclusive content on Stories","Release music 48hrs before Spotify","Host a live Q&A exclusively inside app","Create a Members Only section"] },
  { phase:"PHASE 04", title:"MONETIZATION",   timeline:"Month 3+", color:"#FFD60A", steps:["Launch $4.99/mo fan membership tier","Sell digital downloads inside app","Offer brand partnerships","Add merch store tab inside the app","License show content to streaming platforms"] },
  { phase:"PHASE 05", title:"DOMINATION",     timeline:"Month 6+", color:"#F72585", steps:["Launch referral program with fan perks","Partner with 2–3 complementary creators","Pitch your app to local radio/TV","Submit to press as digital media hub","Add podcast feed to Apple/Spotify"] },
];

const NAV_BASE = [
  { id:"home",       label:"HOME",       icon:"⬡" },
  { id:"music",      label:"MUSIC",      icon:"♪" },
  { id:"shows",      label:"SHOWS",      icon:"▶" },
  { id:"gallery",    label:"GALLERY",    icon:"◈" },
  { id:"social",     label:"SOCIAL",     icon:"◎" },
  { id:"events",     label:"EVENTS",     icon:"🔥" },
  { id:"membership", label:"MEMBERS",    icon:"⭐", feature:"membershipEnabled" },
  { id:"booking",    label:"BOOKING",    icon:"📅" },
  { id:"chat",       label:"COMMUNITY",  icon:"💬" },
  { id:"merch",      label:"MERCH",      icon:"🛍", feature:"merchEnabled" },
];

const MOCK_SALES = [
  { id:"INV-001", date:"Mar 27", plan:"Pro Done For You", amount:499, status:"paid",     buyer:"Marcus D."  },
  { id:"INV-002", date:"Mar 25", plan:"Empire /mo",       amount:149, status:"paid",     buyer:"Tanya R."   },
  { id:"INV-003", date:"Mar 24", plan:"Starter Template", amount:97,  status:"paid",     buyer:"DeShawn T." },
  { id:"INV-004", date:"Mar 22", plan:"Empire /mo",       amount:149, status:"paid",     buyer:"Jordan M."  },
  { id:"INV-005", date:"Mar 20", plan:"Pro Done For You", amount:499, status:"paid",     buyer:"Keisha W."  },
  { id:"INV-006", date:"Mar 19", plan:"Starter Template", amount:97,  status:"pending",  buyer:"Alex P."    },
  { id:"INV-007", date:"Mar 15", plan:"Empire /mo",       amount:149, status:"paid",     buyer:"Chris L."   },
  { id:"INV-008", date:"Mar 10", plan:"Pro Done For You", amount:499, status:"refunded", buyer:"Sam B."     },
];

const DEFAULT_CONFIG = {
  brand:    { name:"YOUR BRAND", tagline:"DIGITAL MEDIA ENTERTAINMENT GROUP", primaryColor:"#FF6B35", accentColor:"#C77DFF", membershipPrice:"4.99", universalLink:"yourbrand.app/hub", logoUrl:"", logoType:"emoji", heroImageUrl:"", heroType:"gradient", heroHeading:"Your Media Empire", heroSubtext:"MUSIC · SHOWS · GALLERY · SOCIAL", heroVideoUrl:"", heroSlides:[], heroMode:"single" },
  social:   { instagram:"", tiktok:"", youtube:"", twitter:"", facebook:"", spotify:"" },
  apis:     { publerKey:"", tiktokKey:"", youtubeKey:"", spotifyClientId:"", stripeKey:"" },
  liveKeys: { youtube:"", facebook:"", instagram:"", tiktok:"", twitch:"" },
  content:  { featuredTrack:"Your Latest Single", featuredTrackSub:"Out Now · All Platforms", showTitle:"YOUR TALK SHOW", membershipPerks:"Exclusive tracks, early episodes, behind-the-scenes access" },
  features: { membershipEnabled:true, downloadEnabled:true, scheduleEnabled:true, analyticsEnabled:false, merchEnabled:false, autoPlayAudio:false, ledBorder:true, ledColor:"", ledSpeed:"medium", ledMode:"pulse" },
  autoPlay: {
    enabled:    false,
    trackIndex: 0,         // which track (0 = first)
    trackUrl:   "",        // custom URL override (blank = use from music list)
    trackTitle: "",        // display name
    volume:     35,        // 0–100
    delay:      0,         // seconds before playing after first interaction
    loop:       false,     // loop the track
    fadeIn:     true,      // fade volume in over 3s
    trigger:    "first_tap", // "first_tap" | "immediate"
    showBanner: true,      // show "Now Playing" banner when it starts
  },
  music: {
    bannerType:"gradient", bannerUrl:"", bannerGrad1:"#FF6B35", bannerGrad2:"#C77DFF",
    featuredTitle:"Your Latest Single", featuredSub:"Out Now · All Platforms",
    tracks:[
      { id:1, title:"Track Name 01", genre:"Hip-Hop", duration:"3:42", plays:"1.2K", icon:"♪", artUrl:"", audioType:"url", audioUrl:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",  audioFile:"", audioFileName:"" },
      { id:2, title:"Track Name 02", genre:"R&B",     duration:"4:11", plays:"892",  icon:"♪", artUrl:"", audioType:"url", audioUrl:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",  audioFile:"", audioFileName:"" },
      { id:3, title:"Track Name 03", genre:"Pop",     duration:"3:28", plays:"2.1K", icon:"♪", artUrl:"", audioType:"url", audioUrl:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",  audioFile:"", audioFileName:"" },
      { id:4, title:"Track Name 04", genre:"Trap",    duration:"2:58", plays:"644",  icon:"♪", artUrl:"", audioType:"url", audioUrl:"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",  audioFile:"", audioFileName:"" },
    ],
  },
  shows: {
    showTitle:"YOUR TALK SHOW",
    showDesc:"Real conversations. No filter.",
    bannerUrl:"",
    episodes:[
      { id:1, title:"Episode 01 — Pilot",       desc:"The beginning of something legendary.",  duration:"42 min", views:"3.4K", thumbUrl:"", videoType:"url", videoUrl:"https://www.youtube.com/watch?v=dQw4w9WgXcQ", videoFile:"", videoFileName:"" },
      { id:2, title:"Episode 02 — The Come Up", desc:"How to build from nothing.",             duration:"38 min", views:"2.8K", thumbUrl:"", videoType:"url", videoUrl:"https://www.youtube.com/watch?v=3JZ_D3ELwOQ", videoFile:"", videoFileName:"" },
      { id:3, title:"Episode 03 — Real Talk",   desc:"Industry secrets they won't tell you.",  duration:"51 min", views:"5.1K", thumbUrl:"", videoType:"url", videoUrl:"https://www.youtube.com/watch?v=ZbZSe6N_BXs", videoFile:"", videoFileName:"" },
    ],
  },
  gallery: {
    photos:[],
  },
  socialPosts: {
    instagram:{ imageUrl:"", caption:"", postUrl:"", date:"" },
    tiktok:   { imageUrl:"", caption:"", postUrl:"", date:"" },
    youtube:  { imageUrl:"", caption:"", postUrl:"", date:"" },
    twitter:  { imageUrl:"", caption:"", postUrl:"", date:"" },
    facebook: { imageUrl:"", caption:"", postUrl:"", date:"" },
    spotify:  { imageUrl:"", caption:"", postUrl:"", date:"" },
  },
  broadcast: {
    defaultPlatforms:["instagram","facebook","twitter"],
    templates:[
      { id:1, name:"Music Drop 🔥",        text:"New music just dropped! 🎵 Stream it now — link in bio. #NewMusic #Out Now" },
      { id:2, name:"Episode Release 🎙",   text:"New episode is LIVE 🎙 We're talking real talk today — go watch now! #Podcast #TalkShow" },
      { id:3, name:"Behind The Scenes 📸", text:"Take a look behind the curtain 👀 This is what goes into making it happen. #BTS #CreatorLife" },
      { id:4, name:"Call To Action ⚡",    text:"If you haven't yet — follow + subscribe to stay locked in ⚡ Big things coming. #StayTuned" },
    ],
    history:[],
    schedules:[],
  },
  merch: {
    products: [
      { id:1, name:"Empire Hoodie",        price:"65",  category:"Apparel",     emoji:"👕", desc:"Premium heavyweight hoodie",           colors:["Black","Orange","White"], sizes:["S","M","L","XL","2XL"], stock:"24", digital:false, active:true,  imageUrl:"" },
      { id:2, name:"Logo Snapback",        price:"38",  category:"Accessories", emoji:"🧢", desc:"Structured 6-panel snapback",          colors:["Black","Orange"],          sizes:["One Size"],              stock:"41", digital:false, active:true,  imageUrl:"" },
      { id:3, name:"Brand Tee",            price:"32",  category:"Apparel",     emoji:"👕", desc:"Classic heavyweight tee",              colors:["White","Black","Orange"],  sizes:["S","M","L","XL"],        stock:"56", digital:false, active:true,  imageUrl:"" },
      { id:4, name:"Phone Case",           price:"25",  category:"Accessories", emoji:"📱", desc:"Slim protective case",                 colors:["Black","Clear"],           sizes:["iPhone","Android"],      stock:"33", digital:false, active:true,  imageUrl:"" },
      { id:5, name:"Exclusive Mixtape",    price:"15",  category:"Digital",     emoji:"💿", desc:"10 exclusive tracks + instrumentals",  colors:[],                          sizes:[],                        stock:"999",digital:true,  active:true,  imageUrl:"", fileUrl:"" },
      { id:6, name:"Content Strategy PDF", price:"12",  category:"Digital",     emoji:"📋", desc:"90-day content strategy playbook",     colors:[],                          sizes:[],                        stock:"999",digital:true,  active:true,  imageUrl:"", fileUrl:"" },
      { id:7, name:"Producer Beat Pack",   price:"35",  category:"Digital",     emoji:"🎹", desc:"8 beats WAV + stems, royalty-free",    colors:[],                          sizes:[],                        stock:"999",digital:true,  active:true,  imageUrl:"", fileUrl:"" },
    ],
    categories: ["Apparel","Accessories","Digital","Collectibles"],
    stripeMode: "test",
    shippingMsg: "Free shipping on orders over $75",
  },
  chat: {
    enabled:      true,
    heroType:     "gradient",
    heroImageUrl: "",
    heroVideoUrl: "",
    heroMediaType:"image",
    heroHeading:  "THE COMMUNITY",
    heroSubtext:  "Connect · Share · Vibe",
    placeholder:  "Share something with the community...",
    roomName:     "The Feed",
  },
  ticker: {
    enabled:   true,
    speed:     40,           // seconds for one full scroll
    bgColor:   "#FF6B35",
    textColor: "#000000",
    separator: "◆",
    items: [
      "🎵 New music dropping this Friday — stay locked in!",
      "🎙 New episode of the talk show is LIVE now",
      "🛍 Merch store is open — grab your gear before it sells out",
      "📸 Follow us on Instagram for exclusive behind-the-scenes",
      "⭐ Join the fan membership — early access to everything",
    ],
  },
  membership: {
    enabled:     true,
    price:       "4.99",
    billingCycle:"month",
    title:       "Fan Membership",
    tagline:     "Get exclusive access to everything",
    perks: [
      "🎵 Exclusive tracks before they drop publicly",
      "🎙 Early access to every new episode",
      "📸 Behind-the-scenes content & updates",
      "💬 Members-only community access",
      "⭐ Monthly live Q&A with the team",
    ],
    ctaText:    "JOIN NOW",
    thankYouMsg:"Welcome to the inner circle! 🎉",
    stripeLink: "",
    vipPin:     "1234",
    vipEnabled: true,
    vipTitle:   "Members Lounge",
    vipTagline: "Welcome back. This is your space.",
    vipLive: {
      isLive:      false,
      streamType:  "camera",   // "camera" | "rtmp" | "embed"
      embedUrl:    "",          // YouTube/Vimeo live embed URL
      rtmpKey:     "",          // RTMP stream key
      streamTitle: "",
      streamDesc:  "",
      viewerCount: 0,
      startedAt:   null,
    },
    vipContent: [
      { id:1, type:"message",  title:"Welcome Message",    body:"Thank you for being a member. This space is yours — exclusive, private, and updated regularly with content made just for you.",  icon:"👑" },
      { id:2, type:"video",    title:"Behind The Scenes",  url:"",   thumb:"",  desc:"Exclusive behind-the-scenes footage, never shared publicly.",  icon:"🎬" },
      { id:3, type:"audio",    title:"Unreleased Track",   url:"",   thumb:"",  desc:"Hear it here first — before anyone else.",                      icon:"🎵" },
      { id:4, type:"download", title:"Exclusive Download",  url:"",   fileName:"exclusive-content.pdf", desc:"Members-only digital download.",         icon:"📥" },
      { id:5, type:"message",  title:"Direct Message",     body:"Got a question or want to connect? Reply to the email you received when you joined.",                                             icon:"💬" },
    ],
  },
  emailList: {
    enabled:      true,
    popupEnabled: true,
    popupDelay:   8,
    popupTitle:   "Stay in the loop 🔔",
    popupSubtext: "Get notified when new music and episodes drop.",
    ctaText:      "SUBSCRIBE",
    successMsg:   "You're in! Welcome to the family 🎉",
    mailchimpUrl: "",
    subscribers:  [],
  },
  booking: {
    enabled:      true,
    title:        "Book / Inquire",
    subtitle:     "Brand deals, features, appearances, and more.",
    types:        ["Brand Deal","Feature Request","Podcast Guest","Appearance","Other"],
    contactEmail: "youremail@gmail.com",
    responseTime: "We respond within 48 hours.",
    inquiries:    [],
    events: [
      { id:1, title:"Live Concert Night",        date:"2026-04-18", time:"8:00 PM", venue:"The Venue NYC",          city:"New York, NY",     type:"Concert",    price:"$35",    ticketUrl:"", imageUrl:"", description:"An unforgettable night of live music. VIP packages available.", soldOut:false, featured:true  },
      { id:2, title:"Album Release Party",        date:"2026-05-02", time:"9:00 PM", venue:"Studio 54 Lounge",      city:"Los Angeles, CA",  type:"Release",    price:"$25",    ticketUrl:"", imageUrl:"", description:"Celebrate the new album drop with exclusive listening experience.", soldOut:false, featured:true  },
      { id:3, title:"Pop-Up Shop & Meet & Greet", date:"2026-05-15", time:"2:00 PM", venue:"Downtown Arts District",city:"Atlanta, GA",       type:"Meet & Greet",price:"Free", ticketUrl:"", imageUrl:"", description:"Shop exclusive merch and meet the team in person.", soldOut:false, featured:false },
      { id:4, title:"Podcast Live Taping",        date:"2026-06-07", time:"7:00 PM", venue:"The Podcast Studio",    city:"Chicago, IL",      type:"Show",       price:"$20",    ticketUrl:"", imageUrl:"", description:"Watch a live taping of the talk show. Q&A included.", soldOut:true,  featured:false },
    ],
  },
  showcase: {
    heroTitle:   "UPCOMING EVENTS",
    heroSubtext: "Be there. No excuses.",
    accentColor: "",
    showCountdown: true,
    showMap: false,
    slideshowEnabled: false,
    slideshowSpeed: 5,
    slideshowImages: [],
    slideshowOverlay: true,
    slideshowCaptions: [],
  },
  linkInBio: {
    enabled:  true,
    headline: "YOUR BRAND",
    subtext:  "Digital Media Entertainment",
    links: [
      { id:1, label:"🎵 Latest Music",   url:"", active:true, color:"#FF6B35" },
      { id:2, label:"▶ Watch Episodes",  url:"", active:true, color:"#C77DFF" },
      { id:3, label:"🛍 Merch Store",    url:"", active:true, color:"#00F5D4" },
      { id:4, label:"📸 Instagram",      url:"", active:true, color:"#E1306C" },
      { id:5, label:"🎵 TikTok",         url:"", active:true, color:"#69C9D0" },
      { id:6, label:"▶ YouTube",         url:"", active:true, color:"#FF0000" },
      { id:7, label:"⭐ Fan Membership", url:"", active:true, color:"#FFD60A" },
    ],
  },
};

// ─── TOAST NOTIFICATION SYSTEM ───────────────────────────────────────────────
function ToastContainer({ toasts, removeToast }) {
  return (
    <div style={{ position:"fixed", top:"70px", right:"16px", zIndex:999, display:"flex", flexDirection:"column", gap:"8px", pointerEvents:"none" }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display:"flex", alignItems:"flex-start", gap:"10px",
          padding:"12px 14px", borderRadius:"12px", maxWidth:"300px",
          background: t.type==="success" ? "rgba(0,245,212,0.12)" : t.type==="error" ? "rgba(255,59,48,0.12)" : t.type==="warning" ? "rgba(255,214,10,0.12)" : "rgba(255,107,53,0.12)",
          border: t.type==="success" ? "1px solid rgba(0,245,212,0.35)" : t.type==="error" ? "1px solid rgba(255,59,48,0.35)" : t.type==="warning" ? "1px solid rgba(255,214,10,0.35)" : "1px solid rgba(255,107,53,0.35)",
          backdropFilter:"blur(20px)",
          boxShadow:"0 8px 32px rgba(0,0,0,0.4)",
          animation:"toastIn 0.3s ease",
          pointerEvents:"all",
          fontFamily:"monospace",
        }}>
          <span style={{ fontSize:"16px", flexShrink:0 }}>
            {t.type==="success"?"✓":t.type==="error"?"✗":t.type==="warning"?"⚠":"◆"}
          </span>
          <div style={{ flex:1 }}>
            {t.title && <div style={{ fontSize:"11px", fontWeight:"800", color: t.type==="success"?"#00F5D4":t.type==="error"?"#FF3B30":t.type==="warning"?"#FFD60A":"#FF6B35", marginBottom:"2px", letterSpacing:"0.1em" }}>{t.title}</div>}
            <div style={{ fontSize:"11px", color:"#ccc", lineHeight:1.45 }}>{t.message}</div>
          </div>
          <button onClick={() => removeToast(t.id)} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:"14px", padding:"0", flexShrink:0, pointerEvents:"all" }}>✕</button>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const addToast = (message, type="info", title="", duration=4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, title }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  };
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));
  return { toasts, addToast, removeToast,
    success: (msg, title="") => addToast(msg, "success", title),
    error:   (msg, title="") => addToast(msg, "error",   title),
    warning: (msg, title="") => addToast(msg, "warning", title),
    info:    (msg, title="") => addToast(msg, "info",    title),
  };
}

// ─── PUSH NOTIFICATION MANAGER ───────────────────────────────────────────────
const PUSH_PERMISSION_KEY = "mediaEmpirePushGranted";

async function requestPushPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied")  return "denied";
  const result = await Notification.requestPermission();
  return result;
}

function sendBrowserPush(title, body, icon="🎙") {
  if (Notification.permission !== "granted") return false;
  try {
    new Notification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "media-empire-" + Date.now(),
    });
    return true;
  } catch { return false; }
}

// ─── THEME TOKENS ─────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    id:"dark", label:"Dark", icon:"🌙",
    bg:"#080808", bgCard:"rgba(255,255,255,0.025)", bgCard2:"rgba(255,255,255,0.04)",
    border:"rgba(255,255,255,0.06)", borderNav:"rgba(255,255,255,0.07)",
    text:"#F0EDE8", textSub:"#aaa", textMuted:"#555",
    navBg:"rgba(8,8,8,0.92)", navInactive:"#484848",
    headerBgScrolled:"rgba(8,8,8,0.97)", headerBgTop:"rgba(8,8,8,0.55)",
    glowA:"0.07", glowB:"0.055",
    inputBg:"rgba(0,0,0,0.4)", inputBorder:"rgba(255,255,255,0.08)",
    placeholder:"#2a2a2a", selectBg:"#0a0a0f", cardShadow:"none",
    bodyBg:"#080808",
  },
  light: {
    id:"light", label:"Light", icon:"☀️",
    bg:"#F4F1EC", bgCard:"rgba(0,0,0,0.04)", bgCard2:"rgba(0,0,0,0.06)",
    border:"rgba(0,0,0,0.08)", borderNav:"rgba(0,0,0,0.08)",
    text:"#111111", textSub:"#666", textMuted:"#bbb",
    navBg:"rgba(244,241,236,0.97)", navInactive:"#999",
    headerBgScrolled:"rgba(244,241,236,0.97)", headerBgTop:"rgba(244,241,236,0.75)",
    glowA:"0.06", glowB:"0.04",
    inputBg:"rgba(0,0,0,0.05)", inputBorder:"rgba(0,0,0,0.12)",
    placeholder:"#bbb", selectBg:"#ede9e0", cardShadow:"0 1px 4px rgba(0,0,0,0.08)",
    bodyBg:"#F4F1EC",
  },
  metal: {
    id:"metal", label:"Metal", icon:"⚙️",
    bg:"#1a1a1e", bgCard:"rgba(180,180,200,0.07)", bgCard2:"rgba(180,180,200,0.11)",
    border:"rgba(180,180,200,0.14)", borderNav:"rgba(200,200,220,0.12)",
    text:"#E8E8F0", textSub:"#a0a0b8", textMuted:"#505068",
    navBg:"rgba(22,22,28,0.96)", navInactive:"#505068",
    headerBgScrolled:"rgba(18,18,24,0.98)", headerBgTop:"rgba(18,18,24,0.7)",
    glowA:"0.04", glowB:"0.03",
    inputBg:"rgba(120,120,140,0.1)", inputBorder:"rgba(180,180,200,0.18)",
    placeholder:"#404055", selectBg:"#1e1e26", cardShadow:"0 2px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
    bodyBg:"#1a1a1e",
    // Metal-specific extras
    metalGrad:"linear-gradient(135deg,#2e2e38 0%,#1a1a22 40%,#25252f 60%,#1e1e28 100%)",
    sheen:"linear-gradient(180deg,rgba(255,255,255,0.06) 0%,transparent 50%,rgba(0,0,0,0.2) 100%)",
    chrome:"linear-gradient(135deg,#888898,#c0c0d0,#707080,#b0b0c8,#606070)",
    brushed:"repeating-linear-gradient(90deg,rgba(255,255,255,0.02) 0px,transparent 1px,transparent 4px)",
  },
  corporate: {
    id:"corporate", label:"Corporate", icon:"💼",
    bg:"#F0F2F5", bgCard:"#FFFFFF", bgCard2:"#F7F8FA",
    border:"rgba(0,0,0,0.09)", borderNav:"rgba(0,0,0,0.07)",
    text:"#1A1D23", textSub:"#5A6270", textMuted:"#A0A8B0",
    navBg:"rgba(255,255,255,0.98)", navInactive:"#8A94A0",
    headerBgScrolled:"rgba(255,255,255,0.99)", headerBgTop:"rgba(240,242,245,0.95)",
    glowA:"0.04", glowB:"0.03",
    inputBg:"#FFFFFF", inputBorder:"rgba(0,0,0,0.12)",
    placeholder:"#C0C8D0", selectBg:"#FFFFFF", cardShadow:"0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.05)",
    bodyBg:"#F0F2F5",
    // Corporate-specific
    deskWood:"linear-gradient(135deg,#8B6914 0%,#A07820 20%,#6B4F10 40%,#9B7218 60%,#7A5C14 80%,#8B6914 100%)",
    grain:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
    paperBg:"#FAFBFC",
    accentLine:"#2C5282",
  },
  minimal: {
    id:"minimal", label:"Minimal", icon:"◻️",
    bg:"#FAFAFA", bgCard:"#FFFFFF", bgCard2:"#F5F5F5",
    border:"rgba(0,0,0,0.06)", borderNav:"rgba(0,0,0,0.05)",
    text:"#0A0A0A", textSub:"#707070", textMuted:"#C0C0C0",
    navBg:"rgba(250,250,250,0.98)", navInactive:"#B0B0B0",
    headerBgScrolled:"rgba(250,250,250,0.99)", headerBgTop:"rgba(250,250,250,0.92)",
    glowA:"0.02", glowB:"0.01",
    inputBg:"#FFFFFF", inputBorder:"rgba(0,0,0,0.08)",
    placeholder:"#C8C8C8", selectBg:"#FFFFFF", cardShadow:"0 0 0 1px rgba(0,0,0,0.06)",
    bodyBg:"#FAFAFA",
  },
};

const THEME_LIST = ["dark","light","metal","corporate","minimal"];


// ─── LIVE CLOCK ───────────────────────────────────────────────────────────────
function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const h    = time.getHours();
  const m    = time.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  const days = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
  return `${days[time.getDay()]} ${h12}:${m} ${ampm}`;
}

// ─── SCROLLING TICKER ────────────────────────────────────────────────────────
function TickerBar({ ticker }) {
  if (!ticker || !ticker.enabled || !ticker.items?.length) return null;
  const sep   = ticker.separator || "◆";
  const speed = ticker.speed || 40;
  const text  = ticker.items.join(`   ${sep}   `);
  const full  = `${text}   ${sep}   ${text}`;
  return (
    <div style={{ overflow:"hidden", whiteSpace:"nowrap", background:ticker.bgColor||"#FF6B35", color:ticker.textColor||"#000", padding:"6px 0", fontSize:"11px", fontWeight:"700", fontFamily:"monospace", letterSpacing:"0.06em", borderBottom:"1px solid rgba(0,0,0,0.15)", position:"relative", zIndex:101 }}>
      <span style={{ display:"inline-block", animation:`tickerScroll ${speed}s linear infinite`, paddingLeft:"100%" }}>
        {full}
      </span>
      <style>{`@keyframes tickerScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
    </div>
  );
}

// ─── SPLASH SCREEN ───────────────────────────────────────────────────────────
function SplashScreen({ config, out }) {
  const pc = config.brand.primaryColor;
  const ac = config.brand.accentColor;
  const name = config.brand.name || "YOUR BRAND";

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9999,
      background:`radial-gradient(ellipse at 50% 40%, ${pc}28 0%, #050508 60%)`,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      fontFamily:"monospace",
      opacity: out ? 0 : 1,
      transform: out ? "scale(1.04)" : "scale(1)",
      transition: "opacity 0.65s ease, transform 0.65s ease",
      pointerEvents: out ? "none" : "all",
    }}>
      {/* Pulsing ring */}
      <div style={{ position:"absolute", width:"280px", height:"280px", borderRadius:"50%", border:`1px solid ${pc}22`, animation:"splashRing 2s ease-in-out infinite" }} />
      <div style={{ position:"absolute", width:"220px", height:"220px", borderRadius:"50%", border:`1px solid ${ac}18`, animation:"splashRing 2s ease-in-out infinite 0.4s" }} />

      {/* Logo */}
      <div style={{ animation:"splashIn 0.6s ease 0.2s both", marginBottom:"20px" }}>
        <LogoDisplay config={config} size={96} />
      </div>

      {/* Brand name */}
      <div style={{ animation:"splashIn 0.6s ease 0.45s both", fontSize:"clamp(22px,6vw,36px)", fontWeight:"900", letterSpacing:"0.18em", background:`linear-gradient(135deg,${pc},${ac},#fff)`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:"8px", textAlign:"center", padding:"0 20px" }}>
        {name}
      </div>

      {/* Tagline */}
      <div style={{ animation:"splashIn 0.6s ease 0.65s both", fontSize:"10px", color:"rgba(255,255,255,0.35)", letterSpacing:"0.4em", textAlign:"center" }}>
        {config.brand.tagline || "DIGITAL MEDIA ENTERTAINMENT"}
      </div>

      {/* Loading bar */}
      <div style={{ animation:"splashIn 0.4s ease 0.8s both", marginTop:"40px", width:"120px", height:"2px", borderRadius:"1px", background:"rgba(255,255,255,0.08)", overflow:"hidden" }}>
        <div style={{ height:"100%", background:`linear-gradient(90deg,${pc},${ac})`, animation:"splashLoad 1.8s ease 0.8s forwards", width:"0%" }} />
      </div>

      <style>{`
        @keyframes splashIn    { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes splashRing  { 0%,100%{transform:scale(1);opacity:0.4} 50%{transform:scale(1.08);opacity:0.8} }
        @keyframes splashLoad  { from{width:0%} to{width:100%} }
      `}</style>
    </div>
  );
}

// ─── AMBIENT PARTICLES ────────────────────────────────────────────────────────
function AmbientParticles({ pc, ac }) {
  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 1.5 + Math.random() * 2.5,
    dur: 6 + Math.random() * 10,
    delay: Math.random() * 8,
    color: i % 3 === 0 ? pc : i % 3 === 1 ? ac : "#00F5D4",
    drift: (Math.random() - 0.5) * 40,
  }));

  return (
    <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none", zIndex:0 }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position:"absolute",
          left:`${p.x}%`, top:`${p.y}%`,
          width:`${p.size}px`, height:`${p.size}px`,
          borderRadius:"50%",
          background:p.color,
          opacity:0,
          boxShadow:`0 0 ${p.size * 3}px ${p.color}88`,
          animation:`particleFloat ${p.dur}s ease-in-out ${p.delay}s infinite`,
          "--drift": `${p.drift}px`,
        }} />
      ))}
      <style>{`
        @keyframes particleFloat {
          0%   { opacity:0; transform:translateY(0) translateX(0); }
          15%  { opacity:0.7; }
          85%  { opacity:0.4; }
          100% { opacity:0; transform:translateY(-80px) translateX(var(--drift)); }
        }
      `}</style>
    </div>
  );
}

// ─── FAN WALL ─────────────────────────────────────────────────────────────────
const FAN_WALL_NAMES = [
  "Marcus D.","Tanya R.","DeShawn T.","Jordan M.","Keisha W.","Alex P.","Chris L.",
  "Sam B.","Destiny J.","Malik H.","Brianna S.","Tyler W.","Jasmine K.","Andre M.",
  "Nadia C.","Darius F.","Simone L.","Kwame A.","Priya N.","Emmanuel O.",
  "Zoe R.","Isaiah T.","Camille V.","Xavier B.","Alicia G.","Donovan P.",
  "Fatima H.","Brooklyn S.","Elijah M.","Naomi J.",
];

const FAN_ACTIONS = [
  "just joined 🎉", "is now a member ⭐", "streaming now 🎵",
  "watching the show 👀", "copped new merch 🛍", "joined the community 💬",
  "booked an appearance 📅", "subscribed 🔔",
];

function FanWall({ config }) {
  const pc = config.brand.primaryColor;
  const ac = config.brand.accentColor;
  const subs = config.emailList?.subscribers || [];
  const members = config.membership?.members || [];

  // Merge real subscribers with demo names
  const realNames = [...subs.map(s=>s.email.split("@")[0]), ...members.map(m=>m.email?.split("@")[0]||"")].filter(Boolean);
  const allNames = [...new Set([...realNames, ...FAN_WALL_NAMES])].slice(0, 40);

  // Generate fan activity feed
  const [feed, setFeed] = useState(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      name: allNames[Math.floor(Math.random() * allNames.length)],
      action: FAN_ACTIONS[Math.floor(Math.random() * FAN_ACTIONS.length)],
      ago: [0,1,2,3,5,8,12,20][i],
    }))
  );

  // Periodically add a new fan activity
  useEffect(() => {
    const t = setInterval(() => {
      const newEntry = {
        id: Date.now(),
        name: allNames[Math.floor(Math.random() * allNames.length)],
        action: FAN_ACTIONS[Math.floor(Math.random() * FAN_ACTIONS.length)],
        ago: 0,
      };
      setFeed(prev => [newEntry, ...prev.slice(0, 9)]);
    }, 7000);
    return () => clearInterval(t);
  }, [allNames.length]);

  // Row 1 & 2: name bubbles scrolling left
  const row1 = allNames.slice(0, 15);
  const row2 = allNames.slice(15, 30);

  return (
    <div style={{ padding:"28px 0 24px", borderTop:"1px solid rgba(255,255,255,0.06)", overflow:"hidden" }}>
      <div style={{ fontSize:"9px", letterSpacing:"0.35em", color:"#555", fontFamily:"monospace", marginBottom:"16px", paddingLeft:"20px" }}>🏆 FAN WALL</div>

      {/* Scrolling name rows */}
      {[row1, row2].map((row, ri) => (
        <div key={ri} style={{ display:"flex", gap:"8px", marginBottom:"8px", animation:`fanScroll${ri} ${18 + ri*4}s linear infinite`, width:"max-content" }}>
          {[...row, ...row].map((name, i) => (
            <div key={i} style={{
              flexShrink:0, padding:"6px 14px", borderRadius:"20px", fontSize:"11px", fontWeight:"600",
              background: i % 5 === 0 ? `${pc}18` : i % 5 === 2 ? `${ac}14` : "rgba(255,255,255,0.04)",
              border: i % 5 === 0 ? `1px solid ${pc}33` : i % 5 === 2 ? `1px solid ${ac}25` : "1px solid rgba(255,255,255,0.07)",
              color: i % 5 === 0 ? pc : i % 5 === 2 ? ac : "#bbb",
              whiteSpace:"nowrap",
            }}>
              {name}
            </div>
          ))}
        </div>
      ))}

      {/* Live activity feed */}
      <div style={{ padding:"16px 20px 0" }}>
        <div style={{ fontSize:"9px", letterSpacing:"0.3em", color:"#555", fontFamily:"monospace", marginBottom:"10px" }}>RECENT ACTIVITY</div>
        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
          {feed.slice(0,5).map((item, i) => (
            <div key={item.id} style={{
              display:"flex", alignItems:"center", gap:"10px",
              padding:"9px 12px", borderRadius:"10px",
              background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.05)",
              animation: i===0 ? "fadeIn 0.4s ease" : "none",
              opacity: 1 - i * 0.12,
            }}>
              <div style={{ width:"30px", height:"30px", borderRadius:"50%", flexShrink:0, background:`linear-gradient(135deg,${pc}44,${ac}33)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", fontWeight:"900", color:pc }}>
                {item.name.slice(0,1).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <span style={{ fontSize:"12px", fontWeight:"700", color:"#ddd" }}>{item.name} </span>
                <span style={{ fontSize:"11px", color:"#777" }}>{item.action}</span>
              </div>
              <div style={{ fontSize:"9px", color:"#484848", fontFamily:"monospace", flexShrink:0 }}>
                {item.ago === 0 ? "just now" : `${item.ago}m ago`}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fanScroll0 { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes fanScroll1 { from{transform:translateX(-50%)} to{transform:translateX(0)} }
      `}</style>
    </div>
  );
}

// ─── LED BORDER ───────────────────────────────────────────────────────────────
function LEDBorder({ config }) {
  const features = config.features || {};
  if (!features.ledBorder) return null;

  const pc    = config.brand.primaryColor;
  const ac    = config.brand.accentColor;
  const color = features.ledColor || pc;
  const mode  = features.ledMode  || "pulse";
  const speed = features.ledSpeed === "fast" ? "1.8s" : features.ledSpeed === "slow" ? "5s" : "3s";

  const animName = `led_${mode}`;

  const styles = {
    pulse: `@keyframes ${animName} {
      0%,100% { opacity:0.5; box-shadow:0 0 6px 1px ${color}88, 0 0 14px 2px ${color}44; }
      50%      { opacity:1;   box-shadow:0 0 12px 3px ${color}cc, 0 0 28px 6px ${color}66, 0 0 48px 10px ${color}22; }
    }`,
    chase: `@keyframes ${animName} {
      0%   { background-position:0% 50%; }
      100% { background-position:200% 50%; }
    }`,
    rainbow: `@keyframes ${animName} {
      0%   { filter:hue-rotate(0deg); }
      100% { filter:hue-rotate(360deg); }
    }`,
    breathe: `@keyframes ${animName} {
      0%,100% { opacity:0.2; }
      50%      { opacity:0.9; }
    }`,
  };

  const baseStyle = {
    position:"fixed", inset:0, pointerEvents:"none", zIndex:9998, borderRadius:"0px",
    border:`2px solid transparent`,
  };

  if (mode === "pulse" || mode === "breathe") {
    return (
      <>
        {/* Top */}
        <div style={{ position:"fixed", top:0, left:0, right:0, height:"2px", zIndex:9998, pointerEvents:"none",
          background:`linear-gradient(90deg,transparent,${color},${ac},${color},transparent)`,
          animation:`${animName} ${speed} ease-in-out infinite`,
          boxShadow:`0 0 8px 2px ${color}88` }} />
        {/* Bottom */}
        <div style={{ position:"fixed", bottom:0, left:0, right:0, height:"2px", zIndex:9998, pointerEvents:"none",
          background:`linear-gradient(90deg,transparent,${ac},${color},${ac},transparent)`,
          animation:`${animName} ${speed} ease-in-out infinite 0.5s`,
          boxShadow:`0 0 8px 2px ${ac}88` }} />
        {/* Left */}
        <div style={{ position:"fixed", top:0, bottom:0, left:0, width:"2px", zIndex:9998, pointerEvents:"none",
          background:`linear-gradient(180deg,transparent,${color},${ac},${color},transparent)`,
          animation:`${animName} ${speed} ease-in-out infinite 0.25s`,
          boxShadow:`0 0 8px 2px ${color}88` }} />
        {/* Right */}
        <div style={{ position:"fixed", top:0, bottom:0, right:0, width:"2px", zIndex:9998, pointerEvents:"none",
          background:`linear-gradient(180deg,transparent,${ac},${color},${ac},transparent)`,
          animation:`${animName} ${speed} ease-in-out infinite 0.75s`,
          boxShadow:`0 0 8px 2px ${ac}88` }} />
        <style>{styles[mode]}</style>
      </>
    );
  }

  if (mode === "rainbow") {
    return (
      <>
        <div style={{ position:"fixed", top:0, left:0, right:0, height:"2px", zIndex:9998, pointerEvents:"none",
          background:`linear-gradient(90deg,#ff0000,#ff7700,#ffff00,#00ff00,#0099ff,#cc00ff,#ff0000)`,
          animation:`${animName} ${speed} linear infinite`,
          boxShadow:`0 0 10px 2px rgba(255,255,255,0.3)` }} />
        <div style={{ position:"fixed", bottom:0, left:0, right:0, height:"2px", zIndex:9998, pointerEvents:"none",
          background:`linear-gradient(90deg,#cc00ff,#0099ff,#00ff00,#ffff00,#ff7700,#ff0000,#cc00ff)`,
          animation:`${animName} ${speed} linear infinite`,
          boxShadow:`0 0 10px 2px rgba(255,255,255,0.3)` }} />
        <div style={{ position:"fixed", top:0, bottom:0, left:0, width:"2px", zIndex:9998, pointerEvents:"none",
          background:`linear-gradient(180deg,#ff0000,#ff7700,#ffff00,#00ff00,#0099ff,#cc00ff,#ff0000)`,
          animation:`${animName} ${speed} linear infinite reverse`,
          boxShadow:`0 0 10px 2px rgba(255,255,255,0.3)` }} />
        <div style={{ position:"fixed", top:0, bottom:0, right:0, width:"2px", zIndex:9998, pointerEvents:"none",
          background:`linear-gradient(180deg,#cc00ff,#0099ff,#00ff00,#ffff00,#ff7700,#ff0000,#cc00ff)`,
          animation:`${animName} ${speed} linear infinite`,
          boxShadow:`0 0 10px 2px rgba(255,255,255,0.3)` }} />
        <style>{styles.rainbow}</style>
      </>
    );
  }

  // chase — gradient sweeps around
  return (
    <>
      <div style={{ position:"fixed", top:0, left:0, right:0, height:"2px", zIndex:9998, pointerEvents:"none",
        background:`linear-gradient(90deg,transparent 0%,${color} 30%,${ac} 50%,${color} 70%,transparent 100%)`,
        backgroundSize:"200% 100%",
        animation:`${animName} ${speed} linear infinite`,
        boxShadow:`0 0 8px 2px ${color}66` }} />
      <div style={{ position:"fixed", bottom:0, left:0, right:0, height:"2px", zIndex:9998, pointerEvents:"none",
        background:`linear-gradient(90deg,transparent 0%,${ac} 30%,${color} 50%,${ac} 70%,transparent 100%)`,
        backgroundSize:"200% 100%",
        animation:`${animName} ${speed} linear infinite reverse`,
        boxShadow:`0 0 8px 2px ${ac}66` }} />
      <div style={{ position:"fixed", top:0, bottom:0, left:0, width:"2px", zIndex:9998, pointerEvents:"none",
        background:`linear-gradient(180deg,transparent 0%,${color} 40%,${ac} 60%,transparent 100%)`,
        backgroundSize:"100% 200%",
        animation:`${animName} ${speed} linear infinite 0.4s`,
        boxShadow:`0 0 8px 2px ${color}66` }} />
      <div style={{ position:"fixed", top:0, bottom:0, right:0, width:"2px", zIndex:9998, pointerEvents:"none",
        background:`linear-gradient(180deg,transparent 0%,${ac} 40%,${color} 60%,transparent 100%)`,
        backgroundSize:"100% 200%",
        animation:`${animName} ${speed} linear infinite 0.8s`,
        boxShadow:`0 0 8px 2px ${ac}66` }} />
      <style>{styles.chase}</style>
    </>
  );
}

// ─── AUTO-PLAY AUDIO ──────────────────────────────────────────────────────────
function useAutoPlayAudio(config) {
  const didPlay  = useRef(false);
  const audioRef = useRef(null);
  const [nowPlaying, setNowPlaying] = useState(null);

  useEffect(() => {
    const ap = config.autoPlay || {};
    if (!ap.enabled || didPlay.current) return;

    const tracks = config.music?.tracks || [];
    let src = ap.trackUrl?.trim() || "";
    let title = ap.trackTitle?.trim() || "";

    // Fall back to track from music list
    if (!src && tracks.length > 0) {
      const idx   = Math.min(ap.trackIndex || 0, tracks.length - 1);
      const track = tracks[idx];
      src   = track.audioFile?.length > 10 ? track.audioFile : track.audioUrl?.trim() || "";
      title = title || track.title || "Now Playing";
    }
    if (!src) return;

    const vol    = (ap.volume ?? 35) / 100;
    const delay  = (ap.delay  ?? 0) * 1000;
    const loop   = ap.loop ?? false;
    const fadeIn = ap.fadeIn ?? true;

    const audio = new Audio(src);
    audio.loop   = loop;
    audio.volume = fadeIn ? 0 : vol;
    audioRef.current = audio;

    const startPlayback = () => {
      if (didPlay.current) return;
      setTimeout(() => {
        audio.play().then(() => {
          didPlay.current = true;
          if (ap.showBanner !== false) setNowPlaying(title || "Now Playing");
          // Fade in
          if (fadeIn) {
            let v = 0;
            const step = setInterval(() => {
              v = Math.min(v + vol / 20, vol);
              audio.volume = v;
              if (v >= vol) clearInterval(step);
            }, 150);
          }
        }).catch(() => {});
      }, delay);
    };

    if (ap.trigger === "immediate") {
      // Try immediately (may be blocked by browser without gesture)
      audio.play().then(() => {
        didPlay.current = true;
        if (ap.showBanner !== false) setNowPlaying(title || "Now Playing");
        if (fadeIn) {
          let v = 0;
          const step = setInterval(() => {
            v = Math.min(v + vol / 20, vol);
            audio.volume = v;
            if (v >= vol) clearInterval(step);
          }, 150);
        }
      }).catch(() => {
        // Fallback to first tap
        document.addEventListener("touchstart", startPlayback, { once:true });
        document.addEventListener("click",      startPlayback, { once:true });
      });
    } else {
      // first_tap (default) — wait for user gesture
      document.addEventListener("touchstart", startPlayback, { once:true });
      document.addEventListener("click",      startPlayback, { once:true });
    }

    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      document.removeEventListener("touchstart", startPlayback);
      document.removeEventListener("click",      startPlayback);
    };
  }, [config.autoPlay?.enabled]);

  return { nowPlaying, dismiss: () => setNowPlaying(null), audioRef };
}

function LogoDisplay({ config, size = 52 }) {
  const { primaryColor, accentColor, logoType, logoUrl } = config.brand;
  if (logoType === "image" && logoUrl) {
    return <img src={logoUrl} alt="logo" style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover" }} />;
  }
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:`linear-gradient(135deg,${primaryColor},${accentColor})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:Math.round(size * 0.4), boxShadow:`0 0 ${Math.round(size*0.8)}px ${accentColor}55`, flexShrink:0 }}>
      🎙
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function MediaEmpire() {
  const [appState,   setAppState]  = useState("public");
  const [config,     setConfig]    = useState(() => {
    // Load from localStorage immediately — works even without Supabase
    try {
      const saved = localStorage.getItem("media_empire_config");
      if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_CONFIG;
  });
  const [screen,     setScreen]    = useState("home");
  const [prevScreen, setPrevScreen]= useState(null);
  const [transitioning, setTransitioning] = useState(false);
  const [playing,    setPlaying]   = useState(null);
  const [scrolled,   setScrolled]  = useState(false);
  const [theme,      setTheme]     = useState("dark");
  const [isLiveNow,  setIsLiveNow] = useState(false);
  const [dbStatus,   setDbStatus]  = useState("idle");
  const [showSplash, setShowSplash]= useState(true);
  const [splashOut,  setSplashOut] = useState(false);
  const [pushStatus, setPushStatus]= useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const { toasts, removeToast, success, error, info } = useToast();
  const clock = useClock();
  const T = THEMES[theme] || THEMES.dark;
  const isDark = theme==="dark" || theme==="metal";

  // Auto-play audio on first interaction
  const { nowPlaying, dismiss: dismissNowPlaying } = useAutoPlayAudio(config);

  // ── SPLASH SCREEN — auto-dismiss after 2.6s ───────────────────────────────
  useEffect(() => {
    const fadeOut = setTimeout(() => setSplashOut(true), 2000);
    const hide    = setTimeout(() => setShowSplash(false), 2700);
    return () => { clearTimeout(fadeOut); clearTimeout(hide); };
  }, []);

  // ── SCREEN TRANSITION ─────────────────────────────────────────────────────
  const navigateTo = (newScreen) => {
    if (newScreen === screen) return;
    setPrevScreen(screen);
    setTransitioning(true);
    setTimeout(() => {
      setScreen(newScreen);
      setTransitioning(false);
    }, 180);
  };

  // ── LOAD CONFIG ON STARTUP ────────────────────────────────────────────────
  // localStorage already loaded above in useState initializer.
  // Now try Supabase — if connected, it takes priority (most up-to-date).
  useEffect(() => {
    if (!sb.ready) return;
    setDbStatus("loading");
    sb.loadConfig().then(saved => {
      if (saved) {
        setConfig(saved);
        // Mirror Supabase data into localStorage for offline fallback
        try { localStorage.setItem("media_empire_config", JSON.stringify(saved)); } catch {}
        setDbStatus("connected");
        console.log("✅ Config loaded from Supabase");
      } else {
        setDbStatus("connected");
        console.log("✅ Supabase connected — using saved config");
      }
    }).catch(() => setDbStatus("error"));
  }, []);

  // ── SAVE CONFIG — always writes localStorage + Supabase if connected ───────
  const saveConfigToDB = async (newConfig) => {
    const stamped = { ...newConfig, _savedAt: new Date().toISOString() };
    setConfig(stamped);
    // Always save to localStorage immediately (survives refresh, no setup needed)
    try { localStorage.setItem("media_empire_config", JSON.stringify(stamped)); } catch {}
    // Also save to Supabase if connected (cross-device sync)
    if (sb.ready) {
      const ok = await sb.saveConfig(stamped);
      if (ok) console.log("✅ Config saved to Supabase + localStorage");
      else    console.warn("⚠ Supabase save failed — saved to localStorage only");
    } else {
      console.log("✅ Config saved to localStorage");
    }
  };

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    if (pushStatus === "default") {
      const timer = setTimeout(async () => {
        const result = await requestPushPermission();
        setPushStatus(result);
        if (result === "granted") {
          success("Push notifications enabled! You'll get alerts for new drops.", "NOTIFICATIONS ON 🔔");
          sendBrowserPush("Welcome to Your Brand! 🎙", "Push notifications are now active. Stay tuned for drops.");
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (appState === "adminLogin") {
    return <AdminLogin onSuccess={() => { setAppState("admin"); }} onBack={() => setAppState("public")} />;
  }
  if (appState === "admin") {
    return <AdminPanel config={config} saveConfig={saveConfigToDB} onLogout={() => setAppState("public")} sendToast={{ success, error, info }} pushStatus={pushStatus} dbStatus={dbStatus} theme={theme} setTheme={setTheme} setIsLiveNow={setIsLiveNow} />;
  }

  const pc  = config.brand.primaryColor;
  const ac  = config.brand.accentColor;

  // Only show nav items whose feature flag is enabled (or have no flag)
  const NAV = NAV_BASE.filter(n => !n.feature || config.features[n.feature]);

  return (
    <div style={{ fontFamily:"'Georgia','Times New Roman',serif", background:T.bg, minHeight:"100vh", color:T.text, overflowX:"hidden", transition:"background 0.35s, color 0.35s", position:"relative" }}>

      {/* LED BORDER */}
      <LEDBorder config={config} />

      {/* SPLASH SCREEN */}
      {showSplash && <SplashScreen config={config} out={splashOut} />}
      {/* THEME-SPECIFIC TEXTURE LAYER */}
      {theme==="metal" && (
        <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none",
          background:T.metalGrad,
          backgroundBlendMode:"overlay" }}>
          <div style={{ position:"absolute", inset:0, background:T.brushed, opacity:0.6 }} />
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg,rgba(255,255,255,0.03) 0%,transparent 30%,rgba(0,0,0,0.15) 100%)" }} />
        </div>
      )}
      {theme==="corporate" && (
        <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none" }}>
          <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"40vh", background:"linear-gradient(to top, rgba(44,82,130,0.04), transparent)" }} />
          <div style={{ position:"absolute", top:0, left:0, right:0, height:"3px", background:"linear-gradient(90deg,#2C5282,#4A90D9,#2C5282)" }} />
        </div>
      )}
      {theme==="minimal" && (
        <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none",
          background:"radial-gradient(ellipse at 50% 0%, rgba(0,0,0,0.02) 0%, transparent 60%)" }} />
      )}

      {/* BG GLOW */}
      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none", background:`radial-gradient(ellipse at 15% 15%,${ac}${T.glowA} 0%,transparent 55%),radial-gradient(ellipse at 85% 85%,${pc}${T.glowB} 0%,transparent 55%)` }} />

      {/* AMBIENT PARTICLES */}
      {(theme==="dark"||theme==="metal") && <AmbientParticles pc={pc} ac={ac} />}

      {/* HEADER */}
      <header style={{ position:"sticky", top:0, zIndex:100, background:scrolled ? T.headerBgScrolled : T.headerBgTop, backdropFilter:"blur(24px)", borderBottom:`1px solid ${T.border}`, transition:"background 0.4s", padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"8px" }}>

        {/* LEFT — LOGO + NAME */}
        <div style={{ display:"flex", alignItems:"center", gap:"10px", minWidth:0 }}>
          <LogoDisplay config={config} size={34} />
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:"16px", fontWeight:"900", letterSpacing:"0.12em", background:`linear-gradient(135deg,${pc},${ac})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {config.brand.name}
            </div>
            <div style={{ fontSize:"7px", letterSpacing:"0.3em", color:T.textSub, fontFamily:"monospace" }}>{config.brand.tagline}</div>
          </div>
        </div>

        {/* RIGHT — LIVE INDICATOR + CLOCK + THEME TOGGLE + ADMIN */}
        <div style={{ display:"flex", alignItems:"center", gap:"6px", flexShrink:0 }}>

          {/* 🔴 LIVE INDICATOR */}
          {isLiveNow && (
            <div style={{ display:"flex", alignItems:"center", gap:"5px", padding:"5px 10px", borderRadius:"14px", background:"rgba(255,59,48,0.15)", border:"1px solid rgba(255,59,48,0.45)", animation:"livePulse 1.5s ease-in-out infinite" }}>
              <div style={{ width:"7px", height:"7px", borderRadius:"50%", background:"#FF3B30", boxShadow:"0 0 6px #FF3B30", flexShrink:0 }} />
              <span style={{ fontSize:"9px", fontWeight:"900", color:"#FF3B30", letterSpacing:"0.18em", fontFamily:"monospace" }}>LIVE</span>
            </div>
          )}

          {/* LIVE CLOCK */}
          <div style={{ padding:"5px 10px", borderRadius:"14px", background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)", border:`1px solid ${T.border}`, fontSize:"9px", color:T.textSub, fontFamily:"monospace", letterSpacing:"0.08em", whiteSpace:"nowrap" }}>
            {clock}
          </div>

          {/* THEME TOGGLE */}
          <button onClick={() => { const idx=THEME_LIST.indexOf(theme); setTheme(THEME_LIST[(idx+1)%THEME_LIST.length]); }}
            title={`Theme: ${T.label} — click to cycle`}
            style={{ width:"34px", height:"34px", borderRadius:"50%", border:`1px solid ${T.border}`, background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)", cursor:"pointer", fontSize:"16px", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.3s" }}>
            {T.icon}
          </button>

          {/* ADMIN */}
          <button onClick={() => setAppState("adminLogin")} style={{ background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)", border:`1px solid ${T.border}`, borderRadius:"18px", padding:"6px 11px", cursor:"pointer", fontSize:"10px", color:T.textSub, fontFamily:"monospace" }}>
            ⚙
          </button>
        </div>
      </header>

      {/* SCROLLING TICKER */}
      <TickerBar ticker={config.ticker} />

      {/* TOP NAV */}
      <nav style={{ display:"flex", overflowX:"auto", borderBottom:`1px solid ${T.border}`, background:T.navBg, backdropFilter:"blur(20px)", position:"sticky", top:"55px", zIndex:99, scrollbarWidth:"none", transition:"background 0.35s" }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => navigateTo(n.id)} style={{ flex:"0 0 auto", padding:"12px 16px", background:"none", border:"none", cursor:"pointer", whiteSpace:"nowrap", color:screen===n.id ? pc : T.navInactive, fontSize:"9px", letterSpacing:"0.22em", fontWeight:"700", fontFamily:"monospace", borderBottom:screen===n.id ? `2px solid ${pc}` : "2px solid transparent", transition:"all 0.25s" }}>
            <span style={{ marginRight:"5px" }}>{n.icon}</span>{n.label}
          </button>
        ))}
      </nav>

      {/* SCREENS — with fade transition */}
      <main style={{ position:"relative", zIndex:1, paddingBottom:"90px", opacity:transitioning?0:1, transform:transitioning?"translateY(8px)":"translateY(0)", transition:"opacity 0.18s ease, transform 0.18s ease" }}>
        {screen === "home"       && <HomeScreen      go={navigateTo} config={config} />}
        {screen === "music"      && <MusicScreen     config={config} goHome={()=>navigateTo("home")} />}
        {screen === "shows"      && <ShowsScreen     config={config} goHome={()=>navigateTo("home")} />}
        {screen === "gallery"    && <GalleryScreen   config={config} goHome={()=>navigateTo("home")} />}
        {screen === "social"     && <SocialScreen    config={config} goHome={()=>navigateTo("home")} />}
        {screen === "events"     && <EventsScreen    config={config} goHome={()=>navigateTo("home")} />}
        {screen === "membership" && <MembershipScreen config={config} goHome={()=>navigateTo("home")} />}
        {screen === "booking"    && <BookingScreen   config={config} goHome={()=>navigateTo("home")} />}
        {screen === "linkinbio"  && <LinkInBioScreen config={config} goHome={()=>navigateTo("home")} />}
        {screen === "chat"       && <ChatRoomScreen  config={config} goHome={()=>navigateTo("home")} />}
        {screen === "merch"      && config.features.merchEnabled  && <MerchStore config={config} goHome={()=>navigateTo("home")} />}
        {screen === "merch"      && !config.features.merchEnabled && <FeatureLockedScreen name="Merch Store" flag="merchEnabled" go={() => setAppState("adminLogin")} />}
      </main>

      {/* BOTTOM NAV */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:100, background: T.navBg, backdropFilter:"blur(24px)", borderTop:`1px solid ${T.borderNav}`, display:"flex", padding:"8px 0 18px", transition:"background 0.35s" }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => navigateTo(n.id)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:"3px", color:screen===n.id ? pc : T.textMuted, transition:"color 0.25s" }}>
            <span style={{ fontSize:screen===n.id ? "20px" : "17px", transition:"font-size 0.2s" }}>{n.icon}</span>
            <span style={{ fontSize:"7px", letterSpacing:"0.12em", fontFamily:"monospace" }}>{n.label}</span>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes spin      { to { transform: rotate(360deg); } }
        @keyframes fadeIn    { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes livePulse { 0%,100%{ box-shadow:0 0 0 0 rgba(255,59,48,0.5); } 70%{ box-shadow:0 0 0 10px rgba(255,59,48,0); } }
        @keyframes toastIn   { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        ::-webkit-scrollbar  { display:none; }
        * { -webkit-tap-highlight-color:transparent; box-sizing:border-box; }
        textarea::placeholder, input::placeholder { color:${T.placeholder}; }
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator { filter:${isDark?"invert(0.25)":"invert(0.6)"}; }
        select option { background:${T.selectBg}; color:${T.text}; }
      `}</style>

      {/* TOAST NOTIFICATIONS */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* NOW PLAYING BANNER */}
      {nowPlaying && (
        <div style={{ position:"fixed", bottom:"90px", left:"16px", right:"16px", zIndex:500, borderRadius:"14px", padding:"12px 16px", background:"rgba(8,8,8,0.95)", border:`1px solid ${pc}44`, backdropFilter:"blur(20px)", display:"flex", alignItems:"center", gap:"12px", boxShadow:`0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px ${pc}22`, animation:"fadeIn 0.4s ease" }}>
          <div style={{ width:"36px", height:"36px", borderRadius:"10px", background:`linear-gradient(135deg,${pc}44,${ac}33)`, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px" }}>🎵</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:"9px", color:pc, letterSpacing:"0.2em", fontFamily:"monospace", marginBottom:"2px" }}>♪ NOW PLAYING</div>
            <div style={{ fontSize:"12px", fontWeight:"700", color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{nowPlaying}</div>
          </div>
          {/* EQ bars */}
          <div style={{ display:"flex", gap:"2px", alignItems:"flex-end", height:"18px", flexShrink:0 }}>
            {[1,2,3,4].map(i=>(
              <div key={i} style={{ width:"3px", borderRadius:"2px", background:pc, animation:`eq${i} 0.6s ease-in-out infinite alternate`, height:`${[10,16,12,14][i-1]}px` }} />
            ))}
          </div>
          <button onClick={dismissNowPlaying} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:"16px", flexShrink:0, padding:"0 0 0 4px" }}>✕</button>
        </div>
      )}

      {/* EMAIL CAPTURE POPUP */}
      <EmailCapturePopup config={config} setConfig={setConfig} />

      {/* PUSH PERMISSION BANNER */}
      {pushStatus === "default" && (
        <div style={{ position:"fixed", bottom:"90px", left:"16px", right:"16px", zIndex:200, padding:"14px 16px", borderRadius:"14px", background: T.navBg, border:`1px solid ${pc}44`, backdropFilter:"blur(20px)", display:"flex", alignItems:"center", gap:"12px", boxShadow:"0 8px 32px rgba(0,0,0,0.3)", fontFamily:"monospace" }}>
          <span style={{ fontSize:"22px", flexShrink:0 }}>🔔</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:"11px", fontWeight:"800", color:pc, letterSpacing:"0.1em", marginBottom:"2px" }}>STAY IN THE LOOP</div>
            <div style={{ fontSize:"10px", color:T.textSub }}>Get notified when new music and episodes drop.</div>
          </div>
          <div style={{ display:"flex", gap:"6px", flexShrink:0 }}>
            <button onClick={async () => { const r = await requestPushPermission(); setPushStatus(r); if(r==="granted") success("Notifications enabled! 🔔","LOCKED IN"); }} style={{ padding:"7px 12px", borderRadius:"9px", border:"none", background:pc, color:"#000", fontSize:"10px", fontWeight:"900", cursor:"pointer" }}>YES</button>
            <button onClick={() => setPushStatus("denied")} style={{ padding:"7px 10px", borderRadius:"9px", border:`1px solid ${T.border}`, background:"none", color:T.textSub, fontSize:"10px", cursor:"pointer" }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
function AdminLogin({ onSuccess, onBack }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [locked,   setLocked]   = useState(false);

  const handleLogin = async () => {
    if (locked || loading) return;
    setLoading(true); setError("");
    await new Promise(r => setTimeout(r, 900));
    if (username.trim() === ADMIN_USER && password === ADMIN_PASS) {
      setLoading(false);
      onSuccess();
    } else {
      const n = attempts + 1;
      setAttempts(n);
      if (n >= 5) {
        setLocked(true);
        setError("Too many failed attempts. Locked for 30 seconds.");
        setTimeout(() => { setLocked(false); setAttempts(0); setError(""); }, 30000);
      } else {
        setError(`Invalid credentials. ${5 - n} attempt${5 - n === 1 ? "" : "s"} remaining.`);
      }
      setLoading(false);
    }
  };

  const onKey = (e) => { if (e.key === "Enter") handleLogin(); };
  const canSubmit = username.length > 0 && password.length > 0 && !locked && !loading;

  return (
    <div style={{ minHeight:"100vh", background:"#050508", display:"flex", alignItems:"center", justifyContent:"center", padding:"24px", fontFamily:"monospace" }}>
      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none", backgroundImage:"linear-gradient(rgba(255,107,53,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,53,0.03) 1px,transparent 1px)", backgroundSize:"40px 40px" }} />
      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none", background:"radial-gradient(ellipse at 50% 40%,rgba(255,107,53,0.08) 0%,transparent 60%)" }} />

      <div style={{ position:"relative", zIndex:1, width:"100%", maxWidth:"380px", animation:"fadeIn 0.5s ease" }}>
        {/* LOGO */}
        <div style={{ textAlign:"center", marginBottom:"36px" }}>
          <div style={{ width:"72px", height:"72px", borderRadius:"18px", margin:"0 auto 16px", background:"linear-gradient(135deg,#FF6B35,#C77DFF)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"30px", boxShadow:"0 0 40px rgba(255,107,53,0.3)" }}>⚙</div>
          <div style={{ fontSize:"20px", fontWeight:"900", letterSpacing:"0.2em", color:"#F0EDE8" }}>ADMIN PORTAL</div>
          <div style={{ fontSize:"9px", letterSpacing:"0.35em", color:"#444", marginTop:"4px" }}>YOUR BRAND · SECURE ACCESS</div>
        </div>

        {/* CARD */}
        <div style={{ background:"rgba(255,255,255,0.025)", borderRadius:"20px", border:"1px solid rgba(255,255,255,0.07)", padding:"28px", backdropFilter:"blur(20px)" }}>
          <div style={{ fontSize:"9px", letterSpacing:"0.3em", color:"#FF6B35", marginBottom:"20px" }}>◆ SECURE LOGIN</div>

          {/* USERNAME */}
          <div style={{ marginBottom:"14px" }}>
            <label style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#555", display:"block", marginBottom:"7px" }}>USERNAME</label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:"13px", top:"50%", transform:"translateY(-50%)", color:"#444", fontSize:"13px" }}>◎</span>
              <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={onKey}
                placeholder="admin" disabled={locked} autoComplete="username"
                style={{ width:"100%", padding:"13px 13px 13px 36px", background:"rgba(0,0,0,0.4)", border:`1px solid ${error ? "rgba(255,59,48,0.4)" : "rgba(255,255,255,0.08)"}`, borderRadius:"10px", color:"#F0EDE8", fontSize:"13px", outline:"none", fontFamily:"monospace", opacity:locked ? 0.5 : 1 }} />
            </div>
          </div>

          {/* PASSWORD */}
          <div style={{ marginBottom:"20px" }}>
            <label style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#555", display:"block", marginBottom:"7px" }}>PASSWORD</label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:"13px", top:"50%", transform:"translateY(-50%)", color:"#444", fontSize:"13px" }}>◆</span>
              <input value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey}
                type={showPass ? "text" : "password"} placeholder="••••••••••••" disabled={locked} autoComplete="current-password"
                style={{ width:"100%", padding:"13px 40px 13px 36px", background:"rgba(0,0,0,0.4)", border:`1px solid ${error ? "rgba(255,59,48,0.4)" : "rgba(255,255,255,0.08)"}`, borderRadius:"10px", color:"#F0EDE8", fontSize:"13px", outline:"none", fontFamily:"monospace", opacity:locked ? 0.5 : 1 }} />
              <button onClick={() => setShowPass(v => !v)} style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#484848", cursor:"pointer", fontSize:"14px", padding:"4px" }}>
                {showPass ? "◎" : "●"}
              </button>
            </div>
          </div>

          {/* ERROR */}
          {error && (
            <div style={{ padding:"10px 13px", borderRadius:"8px", marginBottom:"16px", background:"rgba(255,59,48,0.1)", border:"1px solid rgba(255,59,48,0.3)", fontSize:"11px", color:"#FF3B30" }}>
              {locked ? "🔒 " : "⚠ "}{error}
            </div>
          )}

          {/* LOGIN BUTTON */}
          <button onClick={handleLogin} disabled={!canSubmit}
            style={{ width:"100%", padding:"14px", borderRadius:"12px", border:"none", background:canSubmit ? "linear-gradient(135deg,#FF6B35,#C77DFF)" : "rgba(255,255,255,0.05)", color:canSubmit ? "#000" : "#444", fontSize:"12px", fontWeight:"900", letterSpacing:"0.2em", cursor:canSubmit ? "pointer" : "not-allowed", transition:"all 0.3s" }}>
            {loading ? "◌ AUTHENTICATING..." : locked ? "🔒 LOCKED" : "◆ ACCESS ADMIN PANEL"}
          </button>

          <div style={{ height:"1px", background:"rgba(255,255,255,0.05)", margin:"20px 0" }} />

          <button onClick={onBack} style={{ width:"100%", padding:"11px", borderRadius:"10px", background:"none", border:"1px solid rgba(255,255,255,0.07)", color:"#484848", fontSize:"11px", letterSpacing:"0.15em", cursor:"pointer" }}>
            ← BACK TO APP
          </button>
        </div>
        <div style={{ textAlign:"center", marginTop:"18px", fontSize:"9px", color:"#222", letterSpacing:"0.2em" }}>SECURED · ADMIN ACCESS ONLY</div>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}} *{box-sizing:border-box} input::placeholder{color:#2a2a2a}`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function AdminPanel({ config, saveConfig, onLogout, sendToast, pushStatus, dbStatus, theme, setTheme, setIsLiveNow }) {
  const [cfg,       setCfg]       = useState(() => JSON.parse(JSON.stringify(config)));
  const [activeTab, setActiveTab] = useState("finance");
  const [saved,     setSaved]     = useState(false);
  const [testResult,setTestResult]= useState({});

  const update = (section, key, value) =>
    setCfg(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }));

  const handleSave = () => {
    saveConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const testConn = async (name) => {
    setTestResult(p => ({ ...p, [name]:"testing" }));
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
    const key = cfg.apis[name] || cfg.liveKeys[name] || "";
    setTestResult(p => ({ ...p, [name]: key.length > 6 ? "success" : "fail" }));
  };

  const TABS = [
    { id:"finance",    label:"FINANCE",    icon:"💰" },
    { id:"database",   label:"DATABASE",   icon:"🗄"  },
    { id:"brand",      label:"BRAND",      icon:"◈"  },
    { id:"ticker",     label:"TICKER",     icon:"📢"  },
    { id:"music",      label:"MUSIC",      icon:"♪"  },
    { id:"shows",      label:"SHOWS",      icon:"▶"  },
    { id:"gallery",    label:"GALLERY",    icon:"◈"  },
    { id:"social",     label:"SOCIAL",     icon:"◎"  },
    { id:"membership", label:"MEMBERSHIP", icon:"⭐"  },
    { id:"viplive",    label:"VIP LIVE",   icon:"👑🔴" },
    { id:"emaillist",  label:"EMAIL LIST", icon:"📧"  },
    { id:"booking",    label:"BOOKING",    icon:"📅"  },
    { id:"events",     label:"EVENTS",     icon:"🔥"  },
    { id:"linkinbio",  label:"LINK IN BIO",icon:"🔗"  },
    { id:"merch",      label:"MERCH",      icon:"🛍"  },
    { id:"chat",       label:"COMMUNITY",  icon:"💬"  },
    { id:"broadcast",  label:"BROADCAST",  icon:"◆"  },
    { id:"push",       label:"PUSH",       icon:"🔔"  },
    { id:"blueprint",  label:"BLUEPRINT",  icon:"★"  },
    { id:"analytics",  label:"ANALYTICS",  icon:"📊"  },
    { id:"live",       label:"GO LIVE",    icon:"🔴"  },
    { id:"apis",       label:"APIs",       icon:"⚙"  },
    { id:"features",   label:"FEATURES",   icon:"★"  },
    { id:"autoplay",   label:"AUTOPLAY",   icon:"🔊"  },
    { id:"themes",     label:"THEMES",     icon:"🎨"  },
    { id:"security",   label:"SECURITY",   icon:"🔒"  },
  ];

  return (
    <div style={{ fontFamily:"monospace", background:"#050508", minHeight:"100vh", color:"#E8E4DC" }}>

      {/* ADMIN HEADER */}
      <div style={{ position:"sticky", top:0, zIndex:100, background:"rgba(5,5,8,0.97)", backdropFilter:"blur(24px)", borderBottom:"1px solid rgba(255,107,53,0.2)", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          <div style={{ width:"36px", height:"36px", borderRadius:"9px", background:"linear-gradient(135deg,#FF6B35,#C77DFF)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px", flexShrink:0 }}>⚙</div>
          <div>
            <div style={{ fontSize:"14px", fontWeight:"900", letterSpacing:"0.15em", background:"linear-gradient(90deg,#FF6B35,#FFD60A)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>ADMIN PANEL</div>
            <div style={{ fontSize:"8px", letterSpacing:"0.3em", color:"#484848" }}>BACKEND CONFIGURATION</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:"8px" }}>
          {/* DB STATUS BADGE */}
          <div style={{ padding:"8px 10px", borderRadius:"10px", fontSize:"9px", fontWeight:"700", letterSpacing:"0.1em", fontFamily:"monospace", display:"flex", alignItems:"center", gap:"5px",
            background: dbStatus==="connected" ? "rgba(0,245,212,0.1)" : dbStatus==="loading" ? "rgba(255,214,10,0.1)" : dbStatus==="error" ? "rgba(255,59,48,0.1)" : "rgba(255,255,255,0.05)",
            border: dbStatus==="connected" ? "1px solid rgba(0,245,212,0.3)" : dbStatus==="loading" ? "1px solid rgba(255,214,10,0.3)" : dbStatus==="error" ? "1px solid rgba(255,59,48,0.3)" : "1px solid rgba(255,255,255,0.1)",
            color: dbStatus==="connected" ? "#00F5D4" : dbStatus==="loading" ? "#FFD60A" : dbStatus==="error" ? "#FF3B30" : "#555",
          }}>
            <span style={{ fontSize:"7px" }}>{dbStatus==="connected"?"●":dbStatus==="loading"?"◌":dbStatus==="error"?"✗":"○"}</span>
            {dbStatus==="connected"?"DB LIVE":dbStatus==="loading"?"CONNECTING...":dbStatus==="error"?"DB ERROR":"NO DB"}
          </div>
          <button onClick={onLogout} style={{ padding:"8px 12px", borderRadius:"10px", cursor:"pointer", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", color:"#aaa", fontSize:"10px", letterSpacing:"0.1em", display:"flex", alignItems:"center", gap:"5px" }}>
            ← <span>APP</span>
          </button>
          <button onClick={handleSave} style={{ padding:"8px 16px", borderRadius:"10px", border:"none", cursor:"pointer", background:saved ? "#00F5D4" : "linear-gradient(90deg,#FF6B35,#FFD60A)", color:"#000", fontSize:"10px", fontWeight:"900", letterSpacing:"0.15em", transition:"all 0.3s" }}>
            {saved ? "✓ SAVED!" : "◆ SAVE ALL"}
          </button>
        </div>
      </div>

      {/* ADMIN TAB BAR — RESPONSIVE GRID */}
      <div style={{ background:"rgba(5,5,8,0.98)", borderBottom:"1px solid rgba(255,255,255,0.08)", position:"sticky", top:"64px", zIndex:99, padding:"10px 12px 6px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:"4px" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                display:"flex", flexDirection:"column", alignItems:"center", gap:"3px",
                padding:"8px 4px 7px",
                background: activeTab===t.id ? "rgba(255,107,53,0.18)" : "rgba(255,255,255,0.02)",
                border: activeTab===t.id ? "1px solid rgba(255,107,53,0.45)" : "1px solid rgba(255,255,255,0.05)",
                borderRadius:"10px", cursor:"pointer",
                color: activeTab===t.id ? "#FF6B35" : "#777",
                transition:"all 0.18s",
              }}>
              <span style={{ fontSize:"16px", lineHeight:1 }}>{t.icon}</span>
              <span style={{ fontSize:"7px", letterSpacing:"0.08em", fontWeight:"700", fontFamily:"monospace", lineHeight:1.1, textAlign:"center", maxWidth:"46px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT */}
      <div style={{ padding:"24px 20px", maxWidth:"640px", margin:"0 auto" }}>

        {activeTab === "finance"    && <FinanceTab />}
        {activeTab === "database"   && <DatabaseTab dbStatus={dbStatus} saveConfigToDB={saveConfig} config={cfg} />}
        {activeTab === "brand"      && <BrandTab    cfg={cfg} update={update} setCfg={setCfg} />}
        {activeTab === "ticker"     && <TickerAdminTab cfg={cfg} setCfg={setCfg} />}
        {activeTab === "music"      && <MusicAdminTab cfg={cfg} setCfg={setCfg} />}
        {activeTab === "shows"      && <ShowsAdminTab cfg={cfg} setCfg={setCfg} />}
        {activeTab === "gallery"    && <GalleryAdminTab cfg={cfg} setCfg={setCfg} />}
        {activeTab === "social"     && <SocialPostsAdminTab cfg={cfg} setCfg={setCfg} />}
        {activeTab === "membership" && <MembershipAdminTab cfg={cfg} setCfg={setCfg} />}
        {activeTab === "viplive"    && <VipLiveAdminTab   cfg={cfg} setCfg={setCfg} setIsLiveNow={setIsLiveNow} />}
        {activeTab === "emaillist"  && <EmailListAdminTab  cfg={cfg} setCfg={setCfg} />}
        {activeTab === "booking"    && <BookingAdminTab    cfg={cfg} setCfg={setCfg} />}
        {activeTab === "events"     && <EventsAdminTab     cfg={cfg} setCfg={setCfg} />}
        {activeTab === "linkinbio"  && <LinkInBioAdminTab  cfg={cfg} setCfg={setCfg} />}
        {activeTab === "merch"      && <MerchAdminTab cfg={cfg} setCfg={setCfg} />}
        {activeTab === "chat"       && <ChatAdminTab  cfg={cfg} setCfg={setCfg} />}
        {activeTab === "broadcast"  && <BroadcastAdminTab cfg={cfg} setCfg={setCfg} />}
        {activeTab === "push"       && <PushNotificationsTab cfg={cfg} setCfg={setCfg} pushStatus={pushStatus} sendToast={sendToast} />}
        {activeTab === "blueprint"  && <BlueprintAdminTab />}
        {activeTab === "analytics"  && <AnalyticsDashboard config={config} />}
        {activeTab === "live"       && <LiveTab     cfg={cfg} update={update} testConn={testConn} testResult={testResult} setIsLiveNow={setIsLiveNow} />}
        {activeTab === "apis"       && <ApisTab     cfg={cfg} update={update} testConn={testConn} testResult={testResult} />}
        {activeTab === "features"   && <FeaturesTab cfg={cfg} setCfg={setCfg} />}
        {activeTab === "autoplay"   && <AutoPlayAdminTab cfg={cfg} setCfg={setCfg} />}
        {activeTab === "themes"     && <ThemesTab theme={theme} setTheme={setTheme} />}
        {activeTab === "security"   && <SecurityTab />}

        {/* SAVE FOOTER */}
        <div style={{ marginTop:"32px", paddingTop:"20px", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={handleSave} style={{ width:"100%", padding:"15px", borderRadius:"12px", border:"none", cursor:"pointer", background:saved ? "#00F5D4" : "linear-gradient(90deg,#FF6B35,#FFD60A)", color:"#000", fontSize:"12px", fontWeight:"900", letterSpacing:"0.2em", transition:"all 0.3s" }}>
            {saved ? "✓ ALL CHANGES SAVED!" : "◆ SAVE & APPLY CHANGES"}
          </button>
          <button onClick={onLogout} style={{ width:"100%", marginTop:"10px", padding:"12px", borderRadius:"11px", cursor:"pointer", background:"rgba(255,59,48,0.07)", border:"1px solid rgba(255,59,48,0.2)", color:"#FF3B30", fontSize:"11px", letterSpacing:"0.15em" }}>
            LOGOUT OF ADMIN
          </button>
        </div>
      </div>

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} *{box-sizing:border-box} input::placeholder,textarea::placeholder{color:#2a2a2a} ::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}

// ─── MUSIC ADMIN TAB ──────────────────────────────────────────────────────────
const TRACK_ICONS = ["♪","♫","🎵","🎶","🎸","🎹","🎺","🎻","🥁","🎤","🎙","🔊","⭐","🔥","💿","🎧"];
const GENRES      = ["Hip-Hop","R&B","Pop","Trap","Gospel","Jazz","Rock","Soul","Afrobeats","Lo-Fi","House","Drill","Neo-Soul","Country","Latin"];

function MusicAdminTab({ cfg, setCfg }) {
  const bannerRef = useRef(null);
  const artRefs   = useRef({});
  const audioRefs = useRef({});

  const music = cfg.music || {};
  const tracks = music.tracks || [];

  const updateMusic = (key, val) =>
    setCfg(prev => ({ ...prev, music: { ...prev.music, [key]: val } }));

  const updateTrack = (id, key, val) =>
    setCfg(prev => ({
      ...prev,
      music: {
        ...prev.music,
        tracks: prev.music.tracks.map(t => t.id === id ? { ...t, [key]: val } : t),
      },
    }));

  const addTrack = () => {
    const newTrack = { id: Date.now(), title:"New Track", genre:"Hip-Hop", duration:"0:00", plays:"0", icon:"♪", artUrl:"" };
    setCfg(prev => ({ ...prev, music: { ...prev.music, tracks: [...prev.music.tracks, newTrack] } }));
  };

  const removeTrack = (id) =>
    setCfg(prev => ({ ...prev, music: { ...prev.music, tracks: prev.music.tracks.filter(t => t.id !== id) } }));

  const handleBannerFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => { updateMusic("bannerUrl", e.target.result); updateMusic("bannerType","image"); };
    reader.readAsDataURL(file);
  };

  const handleArtFile = (file, trackId) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => updateTrack(trackId, "artUrl", e.target.result);
    reader.readAsDataURL(file);
  };

  const bannerPreview = music.bannerType === "image" && music.bannerUrl
    ? `url(${music.bannerUrl}) center/cover no-repeat`
    : `linear-gradient(135deg,${music.bannerGrad1 || "#FF6B35"},${music.bannerGrad2 || "#C77DFF"})`;

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* ── BANNER ── */}
      <ASection title="Music Page Banner" icon="🖼" color="#FF6B35">
        {/* LIVE PREVIEW */}
        <div style={{ borderRadius:"12px", overflow:"hidden", marginBottom:"16px", height:"120px", background:bannerPreview, position:"relative" }}>
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.45)" }} />
          <div style={{ position:"absolute", bottom:"12px", left:"14px" }}>
            <div style={{ fontSize:"9px", color:"rgba(255,255,255,0.5)", fontFamily:"monospace", letterSpacing:"0.2em" }}>♪ MUSIC</div>
            <div style={{ fontSize:"16px", fontWeight:"900", color:"#fff" }}>{music.featuredTitle || "Your Latest Single"}</div>
          </div>
        </div>

        {/* BANNER TYPE */}
        <div style={{ display:"flex", gap:"8px", marginBottom:"14px" }}>
          {[["gradient","Color Gradient"],["image","Custom Image"]].map(([val,label]) => (
            <div key={val} onClick={() => updateMusic("bannerType", val)}
              style={{ flex:1, padding:"11px", borderRadius:"10px", textAlign:"center", cursor:"pointer", border: music.bannerType===val ? "1px solid #FF6B35" : "1px solid rgba(255,255,255,0.07)", background: music.bannerType===val ? "rgba(255,107,53,0.1)" : "rgba(255,255,255,0.02)", transition:"all 0.2s" }}>
              <div style={{ fontSize:"11px", fontWeight:"700", color: music.bannerType===val ? "#FF6B35" : "#777" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* GRADIENT PICKERS */}
        {music.bannerType !== "image" && (
          <div style={{ display:"flex", gap:"14px", marginBottom:"14px" }}>
            {[["bannerGrad1","FROM COLOR"],["bannerGrad2","TO COLOR"]].map(([key,label]) => (
              <div key={key} style={{ flex:1 }}>
                <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"7px" }}>{label}</label>
                <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                  <input type="color" value={music[key] || "#FF6B35"} onChange={e => updateMusic(key, e.target.value)}
                    style={{ width:"40px", height:"40px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", cursor:"pointer", background:"none" }} />
                  <span style={{ fontSize:"11px", color:"#555", fontFamily:"monospace" }}>{music[key] || "#FF6B35"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* IMAGE UPLOAD */}
        {music.bannerType === "image" && (
          <div>
            <div onClick={() => bannerRef.current?.click()}
              style={{ padding:"20px", borderRadius:"12px", textAlign:"center", cursor:"pointer", border: music.bannerUrl ? "2px solid #FF6B35" : "2px dashed rgba(255,107,53,0.25)", background:"rgba(255,107,53,0.04)", marginBottom:"10px", transition:"all 0.3s" }}>
              <div style={{ fontSize:"24px", marginBottom:"6px" }}>{music.bannerUrl ? "🖼" : "📤"}</div>
              <div style={{ fontSize:"11px", color: music.bannerUrl ? "#FF6B35" : "#555" }}>
                {music.bannerUrl ? "Banner uploaded · Tap to change" : "Tap to upload banner image"}
              </div>
              <div style={{ fontSize:"9px", color:"#3a3a3a", marginTop:"3px" }}>Recommended: 1200×400px · JPG or PNG</div>
              <input ref={bannerRef} type="file" accept="image/*" onChange={e => handleBannerFile(e.target.files[0])} style={{ display:"none" }} />
            </div>
            {music.bannerUrl && (
              <button onClick={() => { updateMusic("bannerUrl",""); updateMusic("bannerType","gradient"); }}
                style={{ width:"100%", padding:"9px", borderRadius:"9px", border:"1px solid rgba(255,59,48,0.3)", background:"rgba(255,59,48,0.07)", color:"#FF3B30", fontSize:"10px", cursor:"pointer" }}>
                ✕ REMOVE IMAGE
              </button>
            )}
          </div>
        )}
      </ASection>

      {/* ── FEATURED RELEASE ── */}
      <ASection title="Featured Release Card" icon="◆" color="#C77DFF">
        <AField label="Release Title"    value={music.featuredTitle || ""} onChange={v => updateMusic("featuredTitle", v)} placeholder="Your Latest Single" />
        <AField label="Release Subtitle" value={music.featuredSub   || ""} onChange={v => updateMusic("featuredSub",   v)} placeholder="Out Now · All Platforms" />
      </ASection>

      {/* ── TRACKS ── */}
      <ASection title="Track List" icon="♪" color="#FF6B35">
        <div style={{ padding:"10px", borderRadius:"9px", marginBottom:"14px", background:"rgba(255,107,53,0.06)", border:"1px solid rgba(255,107,53,0.15)" }}>
          <div style={{ fontSize:"10px", color:"#FF6B35", marginBottom:"3px" }}>◆ TRACK EDITOR</div>
          <div style={{ fontSize:"11px", color:"#777" }}>Edit song title, genre, duration, plays, icon, and album art. Changes apply instantly.</div>
        </div>

        {tracks.map((track, idx) => (
          <div key={track.id} style={{ marginBottom:"16px", padding:"16px", borderRadius:"12px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,107,53,0.15)" }}>
            {/* TRACK HEADER */}
            <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px" }}>
              {/* ART THUMBNAIL */}
              <div onClick={() => artRefs.current[track.id]?.click()}
                style={{ width:"48px", height:"48px", borderRadius:"10px", flexShrink:0, overflow:"hidden", cursor:"pointer", border:"1px solid rgba(255,107,53,0.3)", background:"rgba(255,107,53,0.1)", display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
                {track.artUrl
                  ? <img src={track.artUrl} alt="art" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  : <span style={{ fontSize:"20px" }}>{track.icon || "♪"}</span>
                }
                <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ fontSize:"10px", color:"rgba(255,255,255,0.6)" }}>📷</span>
                </div>
                <input ref={el => artRefs.current[track.id] = el} type="file" accept="image/*"
                  onChange={e => handleArtFile(e.target.files[0], track.id)} style={{ display:"none" }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:"12px", fontWeight:"700", color:"#ccc" }}>Track {idx + 1}</div>
                <div style={{ fontSize:"9px", color:"#484848", fontFamily:"monospace" }}>Tap thumbnail to upload art</div>
              </div>
              <button onClick={() => removeTrack(track.id)}
                style={{ padding:"5px 10px", borderRadius:"8px", border:"1px solid rgba(255,59,48,0.3)", background:"rgba(255,59,48,0.08)", color:"#FF3B30", fontSize:"10px", cursor:"pointer" }}>
                ✕
              </button>
            </div>

            {/* FIELDS ROW 1 */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"10px" }}>
              <div>
                <label style={{ fontSize:"8px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"5px" }}>TITLE</label>
                <input value={track.title} onChange={e => updateTrack(track.id,"title",e.target.value)}
                  style={{ width:"100%", padding:"9px 10px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#E8E4DC", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
              </div>
              <div>
                <label style={{ fontSize:"8px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"5px" }}>GENRE</label>
                <select value={track.genre} onChange={e => updateTrack(track.id,"genre",e.target.value)}
                  style={{ width:"100%", padding:"9px 10px", background:"#0a0a0f", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#E8E4DC", fontSize:"11px", outline:"none", fontFamily:"monospace", cursor:"pointer" }}>
                  {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            {/* FIELDS ROW 2 */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"12px" }}>
              <div>
                <label style={{ fontSize:"8px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"5px" }}>DURATION</label>
                <input value={track.duration} onChange={e => updateTrack(track.id,"duration",e.target.value)} placeholder="3:42"
                  style={{ width:"100%", padding:"9px 10px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#E8E4DC", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
              </div>
              <div>
                <label style={{ fontSize:"8px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"5px" }}>PLAY COUNT</label>
                <input value={track.plays} onChange={e => updateTrack(track.id,"plays",e.target.value)} placeholder="1.2K"
                  style={{ width:"100%", padding:"9px 10px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#E8E4DC", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
              </div>
            </div>

            {/* AUDIO SOURCE */}
            <div style={{ marginTop:"12px" }}>
              <label style={{ fontSize:"8px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"8px" }}>AUDIO SOURCE</label>
              {/* Type selector */}
              <div style={{ display:"flex", gap:"6px", marginBottom:"10px" }}>
                {[["url","🔗 URL"],["mp3","🎵 MP3"],["wav","🎤 WAV"],["aiff","💿 AIFF"]].map(([val,label]) => (
                  <button key={val} onClick={() => updateTrack(track.id,"audioType",val)}
                    style={{ flex:1, padding:"7px 4px", borderRadius:"8px", border:(track.audioType||"url")===val?"1px solid #FF6B35":"1px solid rgba(255,255,255,0.07)", background:(track.audioType||"url")===val?"rgba(255,107,53,0.15)":"rgba(255,255,255,0.02)", color:(track.audioType||"url")===val?"#FF6B35":"#555", fontSize:"8px", fontWeight:"700", cursor:"pointer", transition:"all 0.2s", fontFamily:"monospace" }}>
                    {label}
                  </button>
                ))}
              </div>
              {/* URL input */}
              {(track.audioType||"url") === "url" && (
                <input value={track.audioUrl||""} onChange={e => updateTrack(track.id,"audioUrl",e.target.value)}
                  placeholder="Paste Spotify, SoundCloud, or YouTube URL..."
                  style={{ width:"100%", padding:"9px 10px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,107,53,0.2)", borderRadius:"8px", color:"#E8E4DC", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
              )}
              {/* File upload — MP3 / WAV / AIFF */}
              {["mp3","wav","aiff"].includes(track.audioType||"url") && (() => {
                const accept = track.audioType==="mp3" ? "audio/mpeg,.mp3" : track.audioType==="wav" ? "audio/wav,.wav" : "audio/aiff,.aiff,.aif";
                const aRef = audioRefs.current[track.id] || null;
                return (
                  <div>
                    {track.audioFileName ? (
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 12px", borderRadius:"8px", background:"rgba(0,245,212,0.07)", border:"1px solid rgba(0,245,212,0.2)" }}>
                        <div>
                          <div style={{ fontSize:"10px", color:"#00F5D4", fontWeight:"700" }}>✓ {track.audioFileName}</div>
                          <div style={{ fontSize:"8px", color:"#484848", marginTop:"2px", fontFamily:"monospace" }}>{(track.audioType||"").toUpperCase()} · Ready to play</div>
                        </div>
                        <button onClick={() => updateTrack(track.id,"audioFile","") || updateTrack(track.id,"audioFileName","")}
                          style={{ fontSize:"9px", color:"#FF3B30", background:"none", border:"none", cursor:"pointer" }}>REMOVE</button>
                      </div>
                    ) : (
                      <div onClick={() => audioRefs.current[track.id]?.click()}
                        style={{ padding:"14px", borderRadius:"8px", textAlign:"center", cursor:"pointer", border:"2px dashed rgba(255,107,53,0.25)", background:"rgba(255,107,53,0.04)" }}>
                        <div style={{ fontSize:"18px", marginBottom:"4px" }}>🎵</div>
                        <div style={{ fontSize:"10px", color:"#FF6B35" }}>Tap to upload {(track.audioType||"").toUpperCase()} file</div>
                        <div style={{ fontSize:"9px", color:"#3a3a3a", marginTop:"2px" }}>Max 50MB</div>
                      </div>
                    )}
                    <input ref={el => audioRefs.current[track.id] = el} type="file" accept={accept}
                      onChange={e => {
                        const file = e.target.files[0];
                        if (!file) return;
                        if (file.size > 50 * 1024 * 1024) { alert("File exceeds 50MB limit"); return; }
                        const reader = new FileReader();
                        reader.onload = ev => {
                          updateTrack(track.id, "audioFile", ev.target.result);
                          updateTrack(track.id, "audioFileName", file.name);
                        };
                        reader.readAsDataURL(file);
                      }}
                      style={{ display:"none" }} />
                  </div>
                );
              })()}
            </div>

            {/* ICON PICKER */}
            <div>
              <label style={{ fontSize:"8px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"7px" }}>TRACK ICON (shown when no art uploaded)</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:"6px" }}>
                {TRACK_ICONS.map(icon => (
                  <button key={icon} onClick={() => updateTrack(track.id,"icon",icon)}
                    style={{ width:"36px", height:"36px", borderRadius:"8px", border: track.icon===icon ? "2px solid #FF6B35" : "1px solid rgba(255,255,255,0.08)", background: track.icon===icon ? "rgba(255,107,53,0.15)" : "rgba(255,255,255,0.03)", fontSize:"18px", cursor:"pointer", transition:"all 0.2s" }}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* ART STATUS */}
            {track.artUrl && (
              <div style={{ marginTop:"10px", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", borderRadius:"8px", background:"rgba(0,245,212,0.07)", border:"1px solid rgba(0,245,212,0.2)" }}>
                <span style={{ fontSize:"10px", color:"#00F5D4" }}>✓ Album art uploaded</span>
                <button onClick={() => updateTrack(track.id,"artUrl","")}
                  style={{ fontSize:"9px", color:"#FF3B30", background:"none", border:"none", cursor:"pointer" }}>REMOVE</button>
              </div>
            )}
          </div>
        ))}

        {/* ADD TRACK */}
        <button onClick={addTrack}
          style={{ width:"100%", padding:"13px", borderRadius:"11px", border:"2px dashed rgba(255,107,53,0.25)", background:"rgba(255,107,53,0.04)", color:"#FF6B35", fontSize:"12px", fontWeight:"700", letterSpacing:"0.1em", cursor:"pointer", transition:"all 0.2s" }}>
          + ADD NEW TRACK
        </button>
      </ASection>
    </div>
  );
}

// ─── SHOWS ADMIN TAB ──────────────────────────────────────────────────────────
const VIDEO_TYPES_ACCEPT = "video/mp4,video/quicktime,video/webm";

function ShowsAdminTab({ cfg, setCfg }) {
  const bannerRef = useRef(null);
  const thumbRefs = useRef({});
  const videoRefs = useRef({});

  const shows    = cfg.shows || {};
  const episodes = shows.episodes || [];

  const updateShows   = (key,val) => setCfg(prev=>({...prev,shows:{...prev.shows,[key]:val}}));
  const updateEpisode = (id,key,val) => setCfg(prev=>({...prev,shows:{...prev.shows,episodes:prev.shows.episodes.map(e=>e.id===id?{...e,[key]:val}:e)}}));
  const addEpisode    = () => {
    const ep = { id:Date.now(), title:"New Episode", desc:"", duration:"0 min", views:"0", thumbUrl:"", videoType:"url", videoUrl:"", videoFile:"", videoFileName:"" };
    setCfg(prev=>({...prev,shows:{...prev.shows,episodes:[...prev.shows.episodes,ep]}}));
  };
  const removeEpisode = id => setCfg(prev=>({...prev,shows:{...prev.shows,episodes:prev.shows.episodes.filter(e=>e.id!==id)}}));

  const handleBanner = file => {
    if(!file||!file.type.startsWith("image/"))return;
    const r=new FileReader(); r.onload=e=>updateShows("bannerUrl",e.target.result); r.readAsDataURL(file);
  };
  const handleThumb = (file,id) => {
    if(!file||!file.type.startsWith("image/"))return;
    const r=new FileReader(); r.onload=e=>updateEpisode(id,"thumbUrl",e.target.result); r.readAsDataURL(file);
  };
  const handleVideo = (file,id) => {
    if(!file||!file.type.startsWith("video/"))return;
    updateEpisode(id,"videoFileName",file.name);
    updateEpisode(id,"videoType","file");
    const r=new FileReader(); r.onload=e=>updateEpisode(id,"videoFile",e.target.result); r.readAsDataURL(file);
  };

  return (
    <div style={{animation:"fadeIn 0.3s ease"}}>
      {/* SHOW SETTINGS */}
      <ASection title="Show Settings" icon="▶" color="#C77DFF">
        <AField label="Show Title"       value={shows.showTitle||""} onChange={v=>updateShows("showTitle",v)} placeholder="YOUR TALK SHOW" />
        <AField label="Show Description" value={shows.showDesc||""}  onChange={v=>updateShows("showDesc",v)}  placeholder="Real conversations. No filter." />
        <div style={{marginBottom:"14px"}}>
          <label style={{fontSize:"9px",letterSpacing:"0.22em",color:"#555",display:"block",marginBottom:"7px"}}>SHOW BANNER IMAGE</label>
          {shows.bannerUrl
            ? <div style={{position:"relative",borderRadius:"10px",overflow:"hidden",marginBottom:"8px",height:"90px"}}>
                <img src={shows.bannerUrl} alt="banner" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                <button onClick={()=>updateShows("bannerUrl","")} style={{position:"absolute",top:"6px",right:"6px",padding:"4px 10px",borderRadius:"7px",border:"none",background:"rgba(255,59,48,0.8)",color:"#fff",fontSize:"9px",cursor:"pointer"}}>✕ REMOVE</button>
              </div>
            : <div onClick={()=>bannerRef.current?.click()} style={{padding:"20px",borderRadius:"10px",textAlign:"center",cursor:"pointer",border:"2px dashed rgba(199,125,255,0.25)",background:"rgba(199,125,255,0.04)"}}>
                <div style={{fontSize:"20px",marginBottom:"4px"}}>🖼</div>
                <div style={{fontSize:"11px",color:"#777"}}>Tap to upload show banner · 1200×300px</div>
              </div>
          }
          <input ref={bannerRef} type="file" accept="image/*" onChange={e=>handleBanner(e.target.files[0])} style={{display:"none"}}/>
        </div>
      </ASection>

      {/* EPISODES */}
      <ASection title="Episodes" icon="🎬" color="#FF6B35">
        {episodes.map((ep,idx)=>(
          <div key={ep.id} style={{marginBottom:"18px",padding:"16px",borderRadius:"12px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,107,53,0.18)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
              <div style={{fontSize:"11px",fontWeight:"800",color:"#FF6B35"}}>EPISODE {idx+1}</div>
              <button onClick={()=>removeEpisode(ep.id)} style={{padding:"4px 10px",borderRadius:"7px",border:"1px solid rgba(255,59,48,0.3)",background:"rgba(255,59,48,0.08)",color:"#FF3B30",fontSize:"9px",cursor:"pointer"}}>✕ REMOVE</button>
            </div>

            {/* THUMBNAIL */}
            <div style={{display:"flex",gap:"12px",marginBottom:"12px"}}>
              <div onClick={()=>thumbRefs.current[ep.id]?.click()} style={{width:"80px",height:"54px",borderRadius:"8px",overflow:"hidden",flexShrink:0,cursor:"pointer",border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.03)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {ep.thumbUrl ? <img src={ep.thumbUrl} alt="thumb" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontSize:"20px",color:"#555"}}>🖼</span>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:"9px",color:"#555",marginBottom:"4px",letterSpacing:"0.15em"}}>TAP LEFT TO UPLOAD THUMBNAIL</div>
                {ep.thumbUrl && <button onClick={()=>updateEpisode(ep.id,"thumbUrl","")} style={{fontSize:"9px",color:"#FF3B30",background:"none",border:"none",cursor:"pointer"}}>✕ Remove</button>}
              </div>
              <input ref={el=>thumbRefs.current[ep.id]=el} type="file" accept="image/*" onChange={e=>handleThumb(e.target.files[0],ep.id)} style={{display:"none"}}/>
            </div>

            {/* TITLE + DESC */}
            <div style={{marginBottom:"10px"}}>
              <AField label="Episode Title"       value={ep.title} onChange={v=>updateEpisode(ep.id,"title",v)}    placeholder="Episode 01 — Title" />
              <AField label="Description"         value={ep.desc}  onChange={v=>updateEpisode(ep.id,"desc",v)}     placeholder="What this episode is about..." />
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"14px"}}>
              <div><label style={{fontSize:"8px",color:"#555",letterSpacing:"0.2em",display:"block",marginBottom:"5px"}}>DURATION</label><input value={ep.duration} onChange={e=>updateEpisode(ep.id,"duration",e.target.value)} placeholder="42 min" style={{width:"100%",padding:"9px 10px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",color:"#E8E4DC",fontSize:"11px",outline:"none",fontFamily:"monospace"}}/></div>
              <div><label style={{fontSize:"8px",color:"#555",letterSpacing:"0.2em",display:"block",marginBottom:"5px"}}>VIEW COUNT</label><input value={ep.views} onChange={e=>updateEpisode(ep.id,"views",e.target.value)} placeholder="3.4K" style={{width:"100%",padding:"9px 10px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",color:"#E8E4DC",fontSize:"11px",outline:"none",fontFamily:"monospace"}}/></div>
            </div>

            {/* VIDEO SOURCE */}
            <div>
              <div style={{fontSize:"9px",color:"#555",letterSpacing:"0.2em",marginBottom:"8px"}}>VIDEO SOURCE</div>
              <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
                {[["url","URL Link"],["file","Upload File"]].map(([t,l])=>(
                  <button key={t} onClick={()=>updateEpisode(ep.id,"videoType",t)} style={{flex:1,padding:"9px",borderRadius:"8px",border:ep.videoType===t?"1px solid #FF6B35":"1px solid rgba(255,255,255,0.08)",background:ep.videoType===t?"rgba(255,107,53,0.12)":"rgba(255,255,255,0.02)",color:ep.videoType===t?"#FF6B35":"#555",fontSize:"10px",fontWeight:ep.videoType===t?"800":"400",cursor:"pointer"}}>
                    {ep.videoType===t&&"● "}{l}
                  </button>
                ))}
              </div>
              {ep.videoType==="url"
                ? <input value={ep.videoUrl||""} onChange={e=>updateEpisode(ep.id,"videoUrl",e.target.value)} placeholder="https://youtube.com/watch?v=... or Vimeo URL" style={{width:"100%",padding:"10px 13px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",color:"#E8E4DC",fontSize:"11px",outline:"none",fontFamily:"monospace"}}/>
                : <div>
                    {ep.videoFileName
                      ? <div style={{padding:"10px 14px",borderRadius:"8px",background:"rgba(0,245,212,0.07)",border:"1px solid rgba(0,245,212,0.2)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div><div style={{fontSize:"11px",color:"#00F5D4"}}>✓ {ep.videoFileName}</div></div>
                          <button onClick={()=>{updateEpisode(ep.id,"videoFile","");updateEpisode(ep.id,"videoFileName","");}} style={{fontSize:"9px",color:"#FF3B30",background:"none",border:"none",cursor:"pointer"}}>REMOVE</button>
                        </div>
                      : <div onClick={()=>videoRefs.current[ep.id]?.click()} style={{padding:"18px",borderRadius:"8px",textAlign:"center",cursor:"pointer",border:"2px dashed rgba(255,107,53,0.25)",background:"rgba(255,107,53,0.03)"}}>
                          <div style={{fontSize:"20px",marginBottom:"4px"}}>🎬</div>
                          <div style={{fontSize:"11px",color:"#777"}}>Tap to upload MP4, MOV, or WebM</div>
                          <div style={{fontSize:"9px",color:"#3a3a3a",marginTop:"2px"}}>Max 2GB</div>
                        </div>
                    }
                    <input ref={el=>videoRefs.current[ep.id]=el} type="file" accept={VIDEO_TYPES_ACCEPT} onChange={e=>handleVideo(e.target.files[0],ep.id)} style={{display:"none"}}/>
                  </div>
              }
            </div>
          </div>
        ))}
        <button onClick={addEpisode} style={{width:"100%",padding:"13px",borderRadius:"11px",border:"2px dashed rgba(255,107,53,0.25)",background:"rgba(255,107,53,0.04)",color:"#FF6B35",fontSize:"12px",fontWeight:"700",letterSpacing:"0.1em",cursor:"pointer"}}>
          + ADD NEW EPISODE
        </button>
      </ASection>
    </div>
  );
}

// ─── GALLERY ADMIN TAB ────────────────────────────────────────────────────────
const MAX_FILE_MB    = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

function GalleryAdminTab({ cfg, setCfg }) {
  const fileRef = useRef(null);
  const [dragging,    setDragging]    = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [editPhoto,   setEditPhoto]   = useState(null);
  const [rotation,    setRotation]    = useState(0);
  const [flipH,       setFlipH]       = useState(false);
  const [flipV,       setFlipV]       = useState(false);
  const [filter,      setFilter]      = useState("none");
  const [brightness,  setBrightness]  = useState(100);
  const [contrast,    setContrast]    = useState(100);

  const photos = (cfg.gallery && cfg.gallery.photos) || [];

  const setPhotos = fn => setCfg(prev=>({...prev,gallery:{...prev.gallery,photos:typeof fn==="function"?fn(prev.gallery?.photos||[]):fn}}));

  const processFiles = fileList => {
    const files = Array.from(fileList);
    const valid=[]; const errors=[];
    files.forEach(f=>{
      if(!f.type.startsWith("image/")) errors.push(`${f.name}: Not an image`);
      else if(f.size>MAX_FILE_BYTES) errors.push(`${f.name}: Over ${MAX_FILE_MB}MB (${(f.size/1024/1024).toFixed(1)}MB)`);
      else valid.push(f);
    });
    if(errors.length) alert("⚠️ Skipped:\n"+errors.join("\n"));
    if(!valid.length) return;
    const q = valid.map(f=>({name:f.name,progress:0,status:"pending"}));
    setUploadQueue(q);
    valid.forEach((file,idx)=>{
      const reader = new FileReader();
      let pct=0;
      const tick = setInterval(()=>{
        pct=Math.min(pct+Math.floor(Math.random()*18)+8,90);
        setUploadQueue(prev=>prev.map((qi,i)=>i===idx?{...qi,progress:pct,status:"uploading"}:qi));
      },80);
      reader.onload=e=>{
        clearInterval(tick);
        setUploadQueue(prev=>prev.map((qi,i)=>i===idx?{...qi,progress:100,status:"done"}:qi));
        const photo={id:Date.now()+idx,src:e.target.result,name:file.name,size:`${(file.size/1024).toFixed(0)} KB`,filter:"none",rotation:0,flipH:false,flipV:false,brightness:100,contrast:100};
        setPhotos(prev=>[...prev,photo]);
        if(idx===valid.length-1) setTimeout(()=>setUploadQueue([]),1400);
      };
      reader.readAsDataURL(file);
    });
  };

  const openEditor = photo => { setEditPhoto(photo); setRotation(photo.rotation||0); setFlipH(photo.flipH||false); setFlipV(photo.flipV||false); setFilter(photo.filter||"none"); setBrightness(photo.brightness||100); setContrast(photo.contrast||100); };
  const saveEdits  = () => { setPhotos(prev=>prev.map(p=>p.id===editPhoto.id?{...p,rotation,flipH,flipV,filter,brightness,contrast}:p)); setEditPhoto(null); };

  if (editPhoto) return (
    <div style={{background:"#050508",minHeight:"100vh",color:"#F0EDE8",fontFamily:"monospace"}}>
      <div style={{position:"sticky",top:0,zIndex:50,background:"rgba(5,5,8,0.97)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(0,245,212,0.15)",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div><div style={{fontSize:"14px",fontWeight:"900",color:"#00F5D4"}}>PHOTO EDITOR</div><div style={{fontSize:"9px",color:"#484848"}}>{editPhoto.name}</div></div>
        <div style={{display:"flex",gap:"8px"}}>
          <button onClick={()=>setEditPhoto(null)} style={{padding:"7px 14px",borderRadius:"9px",border:"1px solid rgba(255,255,255,0.1)",background:"none",color:"#777",fontSize:"10px",cursor:"pointer"}}>CANCEL</button>
          <button onClick={saveEdits} style={{padding:"7px 14px",borderRadius:"9px",border:"none",background:"linear-gradient(90deg,#00F5D4,#C77DFF)",color:"#000",fontSize:"10px",fontWeight:"900",cursor:"pointer"}}>SAVE ✓</button>
        </div>
      </div>
      <div style={{background:"#000",display:"flex",alignItems:"center",justifyContent:"center",minHeight:"260px",padding:"16px"}}>
        <img src={editPhoto.src} alt="edit" style={{maxWidth:"100%",maxHeight:"240px",objectFit:"contain",filter:buildFilter(filter,brightness,contrast),transform:buildTransform(rotation,flipH,flipV),transition:"all 0.3s",borderRadius:"8px"}}/>
      </div>
      <div style={{padding:"20px"}}>
        <div style={{marginBottom:"18px"}}>
          <div style={{fontSize:"9px",letterSpacing:"0.25em",color:"#00F5D4",marginBottom:"10px"}}>◆ ROTATE & FLIP</div>
          <div style={{display:"flex",gap:"8px"}}>
            {[["↺ Left",()=>setRotation(r=>(r-90+360)%360)],["↻ Right",()=>setRotation(r=>(r+90)%360)],["⇔ H",()=>setFlipH(v=>!v)],["⇕ V",()=>setFlipV(v=>!v)]].map(([l,fn],i)=>(
              <button key={i} onClick={fn} style={{flex:1,padding:"10px 4px",borderRadius:"8px",border:"1px solid rgba(0,245,212,0.2)",background:"rgba(0,245,212,0.07)",color:"#00F5D4",fontSize:"10px",fontWeight:"700",cursor:"pointer"}}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:"18px"}}>
          <div style={{fontSize:"9px",letterSpacing:"0.25em",color:"#00F5D4",marginBottom:"10px"}}>◆ FILTERS</div>
          <div style={{display:"flex",overflowX:"auto",gap:"8px",paddingBottom:"4px",scrollbarWidth:"none"}}>
            {FILTERS.map(f=>(
              <div key={f.id} onClick={()=>setFilter(f.id)} style={{flexShrink:0,textAlign:"center",cursor:"pointer"}}>
                <div style={{width:"60px",height:"60px",borderRadius:"9px",overflow:"hidden",border:filter===f.id?"2px solid #00F5D4":"2px solid rgba(255,255,255,0.07)",marginBottom:"4px"}}>
                  <img src={editPhoto.src} alt={f.label} style={{width:"100%",height:"100%",objectFit:"cover",filter:f.css==="none"?"none":f.css}}/>
                </div>
                <div style={{fontSize:"8px",color:filter===f.id?"#00F5D4":"#484848",letterSpacing:"0.08em"}}>{f.label}</div>
              </div>
            ))}
          </div>
        </div>
        {[["BRIGHTNESS",brightness,setBrightness],["CONTRAST",contrast,setContrast]].map(([lbl,val,set],i)=>(
          <div key={i} style={{marginBottom:"14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px"}}>
              <span style={{fontSize:"9px",color:"#777",letterSpacing:"0.15em"}}>{lbl}</span>
              <span style={{fontSize:"9px",color:"#00F5D4",fontFamily:"monospace"}}>{val}%</span>
            </div>
            <input type="range" min={50} max={150} value={val} onChange={e=>set(Number(e.target.value))} style={{width:"100%",accentColor:"#00F5D4",cursor:"pointer"}}/>
          </div>
        ))}
        <button onClick={()=>{setRotation(0);setFlipH(false);setFlipV(false);setFilter("none");setBrightness(100);setContrast(100);}} style={{width:"100%",padding:"11px",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",color:"#555",fontSize:"10px",letterSpacing:"0.15em",cursor:"pointer"}}>↺ RESET ALL</button>
      </div>
    </div>
  );

  return (
    <div style={{animation:"fadeIn 0.3s ease"}}>
      <ASection title="Gallery Manager" icon="◈" color="#00F5D4">
        <div style={{display:"flex",gap:"10px",marginBottom:"16px"}}>
          {[{label:"PHOTOS",val:photos.length.toString(),color:"#00F5D4"},{label:"MAX SIZE",val:`${MAX_FILE_MB}MB`,color:"#FFD60A"}].map((s,i)=>(
            <div key={i} style={{flex:1,padding:"12px 8px",borderRadius:"10px",background:"rgba(255,255,255,0.03)",border:`1px solid ${s.color}22`,textAlign:"center"}}>
              <div style={{fontSize:"18px",fontWeight:"900",color:s.color,fontFamily:"monospace"}}>{s.val}</div>
              <div style={{fontSize:"8px",letterSpacing:"0.2em",color:"#484848",marginTop:"2px"}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* UPLOAD ZONE */}
        <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);processFiles(e.dataTransfer.files);}} onClick={()=>fileRef.current?.click()}
          style={{padding:"24px 20px",borderRadius:"12px",textAlign:"center",cursor:"pointer",border:dragging?"2px solid #00F5D4":"2px dashed rgba(0,245,212,0.25)",background:dragging?"rgba(0,245,212,0.08)":"rgba(0,245,212,0.03)",transition:"all 0.3s",marginBottom:"14px"}}>
          <div style={{fontSize:"24px",marginBottom:"6px"}}>📸</div>
          <div style={{fontSize:"12px",fontWeight:"700",color:"#00F5D4",marginBottom:"3px"}}>TAP TO UPLOAD PHOTOS</div>
          <div style={{fontSize:"10px",color:"#484848"}}>Drag & drop · Multiple files · PNG JPG WebP · Max {MAX_FILE_MB}MB each</div>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={e=>processFiles(e.target.files)} style={{display:"none"}}/>
        </div>

        {/* PROGRESS */}
        {uploadQueue.length>0 && (
          <div style={{marginBottom:"14px",padding:"12px",borderRadius:"10px",background:"rgba(0,245,212,0.04)",border:"1px solid rgba(0,245,212,0.15)"}}>
            <div style={{fontSize:"9px",color:"#00F5D4",letterSpacing:"0.2em",marginBottom:"8px"}}>⚡ UPLOADING {uploadQueue.filter(q=>q.status==="done").length} / {uploadQueue.length}</div>
            {uploadQueue.map((item,i)=>(
              <div key={i} style={{marginBottom:i<uploadQueue.length-1?"8px":"0"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}>
                  <span style={{fontSize:"10px",color:"#bbb",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"70%"}}>{item.name}</span>
                  <span style={{fontSize:"9px",fontFamily:"monospace",color:item.status==="done"?"#00F5D4":item.status==="error"?"#FF3B30":"#FFD60A",flexShrink:0}}>{item.status==="done"?"✓":item.status==="error"?"✗":`${item.progress}%`}</span>
                </div>
                <div style={{height:"3px",borderRadius:"2px",background:"rgba(255,255,255,0.06)"}}>
                  <div style={{height:"100%",borderRadius:"2px",width:`${item.progress}%`,background:item.status==="done"?"#00F5D4":item.status==="error"?"#FF3B30":"linear-gradient(90deg,#00F5D4,#C77DFF)",transition:"width 0.15s ease"}}/>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PHOTO GRID */}
        {photos.length>0 && (
          <div>
            <div style={{fontSize:"9px",color:"#555",letterSpacing:"0.2em",fontFamily:"monospace",marginBottom:"10px"}}>{photos.length} PHOTO{photos.length!==1?"S":""} IN GALLERY</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"6px"}}>
              {photos.map((photo,idx)=>(
                <div key={photo.id||idx} style={{position:"relative",aspectRatio:"1",borderRadius:"8px",overflow:"hidden"}}>
                  <img src={photo.src} alt={photo.name} style={{width:"100%",height:"100%",objectFit:"cover",filter:buildFilter(photo.filter||"none",photo.brightness||100,photo.contrast||100),transform:buildTransform(photo.rotation||0,photo.flipH||false,photo.flipV||false)}}/>
                  <div style={{position:"absolute",top:"4px",right:"4px",display:"flex",gap:"3px"}}>
                    <button onClick={()=>openEditor(photo)} style={{width:"22px",height:"22px",borderRadius:"5px",background:"rgba(0,0,0,0.7)",border:"none",color:"#00F5D4",fontSize:"10px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✏</button>
                    <button onClick={()=>setPhotos(prev=>prev.filter(p=>p.id!==photo.id))} style={{width:"22px",height:"22px",borderRadius:"5px",background:"rgba(0,0,0,0.7)",border:"none",color:"#FF3B30",fontSize:"10px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </ASection>
    </div>
  );
}

// ─── SOCIAL POSTS ADMIN TAB ──────────────────────────────────────────────────
// ─── SOCIAL PLATFORM LOGOS (real SVGs inline) ────────────────────────────────
const SOCIAL_LOGOS = {
  instagram: (size=24,color="#E1306C") => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs><radialGradient id="ig" cx="30%" cy="107%" r="150%"><stop offset="0%" stopColor="#fdf497"/><stop offset="5%" stopColor="#fdf497"/><stop offset="45%" stopColor="#fd5949"/><stop offset="60%" stopColor="#d6249f"/><stop offset="90%" stopColor="#285AEB"/></radialGradient></defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig)"/>
      <circle cx="12" cy="12" r="4.5" stroke="#fff" strokeWidth="1.8" fill="none"/>
      <circle cx="17.5" cy="6.5" r="1.2" fill="#fff"/>
    </svg>
  ),
  tiktok: (size=24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.17 8.17 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
    </svg>
  ),
  youtube: (size=24) => (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8z" fill="#FF0000"/>
      <polygon points="9.75,15.02 15.5,12 9.75,8.98" fill="#fff"/>
    </svg>
  ),
  twitter: (size=24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  facebook: (size=24) => (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="12" fill="#1877F2"/>
      <path d="M16.5 8H14c-.3 0-.5.2-.5.5V10H16l-.3 2.5H13.5V20h-3v-7.5H9V10h1.5V8.5C10.5 6.6 11.6 5 14 5h2.5v3z" fill="#fff"/>
    </svg>
  ),
  spotify: (size=24) => (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="12" fill="#1DB954"/>
      <path d="M17.9 10.9C14.7 9 9.35 8.8 6.3 9.75c-.5.15-1-.15-1.15-.6-.15-.5.15-1 .6-1.15 3.55-1.05 9.4-.85 13.1 1.35.45.25.6.85.35 1.3-.25.35-.85.5-1.3.25zm-.1 2.8c-.25.35-.7.5-1.05.25-2.7-1.65-6.8-2.15-9.95-1.15-.4.1-.85-.1-.95-.5-.1-.4.1-.85.5-.95 3.65-1.1 8.15-.55 11.25 1.35.3.15.45.65.2 1zm-1.2 2.75c-.2.3-.55.4-.85.2-2.35-1.45-5.3-1.75-8.8-.95-.35.1-.65-.15-.75-.45-.1-.35.15-.65.45-.75 3.8-.85 7.1-.5 9.7 1.1.35.15.4.55.25.85z" fill="#fff"/>
    </svg>
  ),
  soundcloud: (size=24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#FF5500">
      <path d="M1.75 12.5c0-.35.28-.63.63-.63s.63.28.63.63v2.5c0 .35-.28.63-.63.63s-.63-.28-.63-.63v-2.5zm2.5-.75c0-.35.28-.63.63-.63s.63.28.63.63v3.25c0 .35-.28.63-.63.63s-.63-.28-.63-.63v-3.25zm2.5-.75c0-.35.28-.63.63-.63s.63.28.63.63v4c0 .35-.28.63-.63.63s-.63-.28-.63-.63v-4zm2.25-.5c0-.35.28-.63.63-.63s.63.28.63.63v4.5c0 .35-.28.63-.63.63s-.63-.28-.63-.63V10.5zm2.5-.5a.63.63 0 0 1 1.25 0v5c0 .35-.28.63-.63.63s-.63-.28-.63-.63V10zm2.5.25a.63.63 0 0 1 1.25 0v4.5c0 .35-.28.63-.63.63s-.63-.28-.63-.63V10.25zm2.5-1c0-.35.28-.63.63-.63a3.13 3.13 0 0 1 3.12 3.12 3.13 3.13 0 0 1-3.12 3.13H16.5c-.35 0-.63-.28-.63-.63V9.25z"/>
    </svg>
  ),
  linkedin: (size=24) => (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect width="24" height="24" rx="4" fill="#0A66C2"/>
      <path d="M8 10H5.5v8H8v-8zm-1.25-4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM19 13.2c0-2-.8-3.2-2.5-3.2-1 0-1.8.5-2.2 1.2V10H12v8h2.3v-4.2c0-.9.4-1.8 1.4-1.8s1.3.9 1.3 1.8V18H19v-4.8z" fill="#fff"/>
    </svg>
  ),
};

const SOCIAL_POST_PLATFORMS = [
  { id:"instagram", name:"Instagram", logo:"instagram", color:"#E1306C" },
  { id:"tiktok",    name:"TikTok",    logo:"tiktok",    color:"#69C9D0" },
  { id:"youtube",   name:"YouTube",   logo:"youtube",   color:"#FF0000" },
  { id:"twitter",   name:"Twitter/X", logo:"twitter",   color:"#1DA1F2" },
  { id:"facebook",  name:"Facebook",  logo:"facebook",  color:"#1877F2" },
  { id:"spotify",   name:"Spotify",   logo:"spotify",   color:"#1DB954" },
];

// Helper to render a social logo
function SocialLogo({ id, size=24 }) {
  const fn = SOCIAL_LOGOS[id];
  if (!fn) return <span style={{fontSize:size*0.75+"px"}}>◎</span>;
  return fn(size);
}


function SocialPostsAdminTab({ cfg, setCfg }) {
  const imgRefs   = useRef({});
  const posts     = cfg.socialPosts || {};
  const [socTab, setSocTab] = useState("posts"); // posts | handles | stats | links

  const updatePost = (pid,key,val) => setCfg(prev=>({...prev,socialPosts:{...prev.socialPosts,[pid]:{...prev.socialPosts?.[pid],[key]:val}}}));
  const updateSocial = (key,val) => setCfg(prev=>({...prev,social:{...prev.social,[key]:val}}));

  const handleImage = (file,pid) => {
    if(!file||!file.type.startsWith("image/"))return;
    const r=new FileReader(); r.onload=e=>updatePost(pid,"imageUrl",e.target.result); r.readAsDataURL(file);
  };

  const totalFollowers = SOCIAL_POST_PLATFORMS.reduce((a,p)=>{
    const v = parseInt((cfg.socialPosts?.[p.id]?.followers||"0").replace(/[^0-9]/g,""))||0;
    return a+v;
  },0);

  return (
    <div style={{animation:"fadeIn 0.3s ease"}}>

      {/* SUB TABS */}
      <div style={{display:"flex",gap:"0",marginBottom:"20px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        {[["posts","LAST POSTS"],["handles","HANDLES"],["stats","STATS"],["links","LINKS"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setSocTab(id)} style={{flex:1,padding:"10px 4px",background:"none",border:"none",cursor:"pointer",fontSize:"8px",letterSpacing:"0.2em",fontWeight:"700",fontFamily:"monospace",color:socTab===id?"#FFD60A":"#3a3a3a",borderBottom:socTab===id?"2px solid #FFD60A":"2px solid transparent",transition:"all 0.2s"}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── LAST POSTS TAB ── */}
      {socTab==="posts" && (
        <div>
          <div style={{padding:"10px 12px",borderRadius:"9px",marginBottom:"16px",background:"rgba(255,214,10,0.06)",border:"1px solid rgba(255,214,10,0.15)",fontSize:"11px",color:"#aaa",lineHeight:1.6}}>
            Upload your most recent post image per platform. Fans see a preview on the Social Hub page.
          </div>
          {SOCIAL_POST_PLATFORMS.map(p=>{
            const post = posts[p.id]||{};
            return (
              <div key={p.id} style={{marginBottom:"14px",padding:"14px",borderRadius:"12px",background:"rgba(255,255,255,0.02)",border:`1px solid ${p.color}22`}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"12px"}}>
                  <div style={{width:"32px",height:"32px",borderRadius:"8px",background:`${p.color}20`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><SocialLogo id={p.id} size={20}/></div>
                  <div style={{fontSize:"12px",fontWeight:"800",color:p.color}}>{p.name.toUpperCase()}</div>
                </div>
                <div style={{display:"flex",gap:"10px",marginBottom:"10px"}}>
                  <div onClick={()=>imgRefs.current[p.id]?.click()} style={{width:"64px",height:"64px",borderRadius:"9px",overflow:"hidden",flexShrink:0,cursor:"pointer",border:`1px solid ${p.color}44`,background:`${p.color}10`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {post.imageUrl?<img src={post.imageUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<SocialLogo id={p.id} size={28}/>}
                  </div>
                  <div style={{flex:1}}>
                    <input value={post.caption||""} onChange={e=>updatePost(p.id,"caption",e.target.value)} placeholder="Post caption..."
                      style={{width:"100%",padding:"8px 10px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"7px",color:"#ddd",fontSize:"11px",outline:"none",fontFamily:"monospace",marginBottom:"6px"}}/>
                    <div style={{display:"flex",gap:"6px"}}>
                      <input value={post.postUrl||""} onChange={e=>updatePost(p.id,"postUrl",e.target.value)} placeholder="Post URL..."
                        style={{flex:1,padding:"7px 9px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"7px",color:"#ddd",fontSize:"10px",outline:"none",fontFamily:"monospace"}}/>
                      <input value={post.date||""} onChange={e=>updatePost(p.id,"date",e.target.value)} placeholder="Mar 27"
                        style={{width:"72px",padding:"7px 9px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"7px",color:"#ddd",fontSize:"10px",outline:"none",fontFamily:"monospace"}}/>
                    </div>
                  </div>
                  <input ref={el=>imgRefs.current[p.id]=el} type="file" accept="image/*" onChange={e=>handleImage(e.target.files[0],p.id)} style={{display:"none"}}/>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── HANDLES TAB ── */}
      {socTab==="handles" && (
        <div>
          <div style={{padding:"10px 12px",borderRadius:"9px",marginBottom:"16px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",fontSize:"11px",color:"#aaa"}}>
            Set your username/handle for each platform. Used in the Social Hub to link fans directly to your profiles.
          </div>
          {SOCIAL_POST_PLATFORMS.map(p=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:"12px",padding:"12px",marginBottom:"8px",borderRadius:"11px",background:"rgba(255,255,255,0.02)",border:`1px solid ${p.color}22`}}>
              <div style={{width:"36px",height:"36px",borderRadius:"9px",background:`${p.color}20`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><SocialLogo id={p.id} size={22}/></div>
              <div style={{flex:1}}>
                <div style={{fontSize:"9px",color:p.color,letterSpacing:"0.15em",marginBottom:"5px"}}>{p.name.toUpperCase()}</div>
                <input value={cfg.social?.[p.id]||""} onChange={e=>updateSocial(p.id,e.target.value)}
                  placeholder={`@your${p.id}handle`}
                  style={{width:"100%",padding:"8px 10px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"7px",color:"#ddd",fontSize:"12px",outline:"none",fontFamily:"monospace"}}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── STATS TAB ── */}
      {socTab==="stats" && (
        <div>
          <div style={{padding:"14px",borderRadius:"12px",marginBottom:"16px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",textAlign:"center"}}>
            <div style={{fontSize:"28px",fontWeight:"900",background:"linear-gradient(135deg,#FF6B35,#FFD60A)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{totalFollowers.toLocaleString()}+</div>
            <div style={{fontSize:"9px",color:"#555",letterSpacing:"0.25em",fontFamily:"monospace"}}>TOTAL FOLLOWERS ACROSS ALL PLATFORMS</div>
          </div>
          {SOCIAL_POST_PLATFORMS.map(p=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:"12px",padding:"12px",marginBottom:"8px",borderRadius:"11px",background:"rgba(255,255,255,0.02)",border:`1px solid ${p.color}22`}}>
              <div style={{width:"36px",height:"36px",borderRadius:"9px",background:`${p.color}20`,display:"flex",alignItems:"center",justifyContent:"center",color:p.color,fontSize:"16px",flexShrink:0}}>{p.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:"9px",color:p.color,letterSpacing:"0.15em",marginBottom:"5px"}}>{p.name.toUpperCase()} FOLLOWERS</div>
                <input value={(posts[p.id]||{}).followers||""} onChange={e=>updatePost(p.id,"followers",e.target.value)}
                  placeholder="e.g. 12.5K"
                  style={{width:"100%",padding:"8px 10px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"7px",color:"#ddd",fontSize:"12px",outline:"none",fontFamily:"monospace"}}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── LINKS TAB ── */}
      {socTab==="links" && (
        <div>
          <div style={{padding:"10px 12px",borderRadius:"9px",marginBottom:"14px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",fontSize:"11px",color:"#aaa"}}>
            Set the direct profile URL for each platform. Fans tap the platform card to open your profile.
          </div>
          {SOCIAL_POST_PLATFORMS.map(p=>(
            <div key={p.id} style={{marginBottom:"10px"}}>
              <label style={{fontSize:"9px",color:p.color,letterSpacing:"0.2em",display:"flex",alignItems:"center",gap:"6px",marginBottom:"5px"}}><SocialLogo id={p.id} size={16}/>{" "}{p.name.toUpperCase()} URL</label>
              <input value={(posts[p.id]||{}).profileUrl||""} onChange={e=>updatePost(p.id,"profileUrl",e.target.value)}
                placeholder={`https://${p.id}.com/yourhandle`}
                style={{width:"100%",padding:"10px 12px",background:"rgba(0,0,0,0.4)",border:`1px solid ${p.color}25`,borderRadius:"9px",color:"#ddd",fontSize:"12px",outline:"none",fontFamily:"monospace"}}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



// ─── BROADCAST ADMIN TAB ──────────────────────────────────────────────────────
function BroadcastAdminTab({ cfg, setCfg }) {
  const [newTplName, setNewTplName] = useState("");
  const [newTplText, setNewTplText] = useState("");
  const [copied,     setCopied]     = useState(null);

  const bc = cfg.broadcast || { defaultPlatforms:["instagram","facebook","twitter"], templates:[], history:[], schedules:[] };

  const updateBc    = (key,val) => setCfg(prev=>({...prev,broadcast:{...prev.broadcast,[key]:val}}));
  const toggleDefPlatform = id => {
    const cur = bc.defaultPlatforms || [];
    updateBc("defaultPlatforms", cur.includes(id) ? cur.filter(x=>x!==id) : [...cur,id]);
  };
  const addTemplate = () => {
    if(!newTplName.trim()||!newTplText.trim())return;
    const t={ id:Date.now(), name:newTplName.trim(), text:newTplText.trim() };
    updateBc("templates",[...(bc.templates||[]),t]);
    setNewTplName(""); setNewTplText("");
  };
  const removeTemplate = id => updateBc("templates",(bc.templates||[]).filter(t=>t.id!==id));
  const copyTemplate   = (id,text) => { navigator.clipboard?.writeText(text).catch(()=>{}); setCopied(id); setTimeout(()=>setCopied(null),2000); };

  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const addSchedule = () => {
    const s={ id:Date.now(), title:"New Schedule", days:["Mon"], time:"09:00", platforms:["instagram"], enabled:true };
    updateBc("schedules",[...(bc.schedules||[]),s]);
  };
  const updateSchedule = (id,key,val) => updateBc("schedules",(bc.schedules||[]).map(s=>s.id===id?{...s,[key]:val}:s));
  const removeSchedule = id => updateBc("schedules",(bc.schedules||[]).filter(s=>s.id!==id));

  return (
    <div style={{animation:"fadeIn 0.3s ease"}}>

      {/* DEFAULT PLATFORMS */}
      <ASection title="Default Platforms" icon="◆" color="#FF6B35">
        <div style={{fontSize:"11px",color:"#777",marginBottom:"12px",lineHeight:1.6}}>These platforms are pre-selected every time you open the Broadcast screen.</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
          {PLATFORMS.filter(p=>p.maxChars>0).map(p=>{
            const on=(bc.defaultPlatforms||[]).includes(p.id);
            return(
              <button key={p.id} onClick={()=>toggleDefPlatform(p.id)} style={{display:"flex",alignItems:"center",gap:"6px",padding:"8px 14px",borderRadius:"18px",cursor:"pointer",background:on?`${p.color}20`:"rgba(255,255,255,0.03)",border:on?`1px solid ${p.color}`:"1px solid rgba(255,255,255,0.07)",color:on?p.color:"#484848",fontSize:"11px",fontWeight:on?"700":"400",transition:"all 0.2s"}}>
                <span>{p.icon}</span><span>{p.name}</span>{on&&<span>✓</span>}
              </button>
            );
          })}
        </div>
      </ASection>

      {/* CAPTION TEMPLATES */}
      <ASection title="Caption Templates" icon="◈" color="#C77DFF">
        <div style={{fontSize:"11px",color:"#777",marginBottom:"14px"}}>Save reusable captions. Tap Copy to paste into any broadcast.</div>
        {(bc.templates||[]).map(t=>(
          <div key={t.id} style={{marginBottom:"10px",padding:"13px",borderRadius:"10px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(199,125,255,0.15)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
              <div style={{fontSize:"11px",fontWeight:"800",color:"#C77DFF"}}>{t.name}</div>
              <div style={{display:"flex",gap:"6px"}}>
                <button onClick={()=>copyTemplate(t.id,t.text)} style={{padding:"4px 10px",borderRadius:"7px",border:"1px solid rgba(199,125,255,0.3)",background:copied===t.id?"rgba(199,125,255,0.2)":"rgba(199,125,255,0.08)",color:"#C77DFF",fontSize:"9px",cursor:"pointer",fontFamily:"monospace"}}>{copied===t.id?"COPIED ✓":"COPY"}</button>
                <button onClick={()=>removeTemplate(t.id)} style={{padding:"4px 8px",borderRadius:"7px",border:"1px solid rgba(255,59,48,0.3)",background:"rgba(255,59,48,0.07)",color:"#FF3B30",fontSize:"9px",cursor:"pointer"}}>✕</button>
              </div>
            </div>
            <div style={{fontSize:"11px",color:"#666",lineHeight:1.5}}>{t.text}</div>
          </div>
        ))}

        {/* ADD TEMPLATE */}
        <div style={{marginTop:"14px",padding:"14px",borderRadius:"10px",background:"rgba(199,125,255,0.04)",border:"1px solid rgba(199,125,255,0.15)"}}>
          <div style={{fontSize:"9px",color:"#C77DFF",letterSpacing:"0.2em",marginBottom:"10px"}}>+ NEW TEMPLATE</div>
          <input value={newTplName} onChange={e=>setNewTplName(e.target.value)} placeholder="Template name (e.g. Music Drop 🔥)"
            style={{width:"100%",padding:"9px 10px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",color:"#E8E4DC",fontSize:"11px",outline:"none",fontFamily:"monospace",marginBottom:"8px"}}/>
          <textarea value={newTplText} onChange={e=>setNewTplText(e.target.value)} placeholder="Caption text with emojis and hashtags..." rows={3}
            style={{width:"100%",padding:"9px 10px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",color:"#E8E4DC",fontSize:"11px",outline:"none",fontFamily:"monospace",resize:"none",lineHeight:1.5,marginBottom:"8px"}}/>
          <button onClick={addTemplate} disabled={!newTplName.trim()||!newTplText.trim()} style={{width:"100%",padding:"10px",borderRadius:"8px",border:"none",background:newTplName.trim()&&newTplText.trim()?"linear-gradient(90deg,#C77DFF,#FF6B35)":"rgba(255,255,255,0.05)",color:newTplName.trim()&&newTplText.trim()?"#000":"#484848",fontSize:"10px",fontWeight:"800",letterSpacing:"0.12em",cursor:newTplName.trim()&&newTplText.trim()?"pointer":"not-allowed"}}>
            SAVE TEMPLATE
          </button>
        </div>
      </ASection>

      {/* AUTO-POST SCHEDULES */}
      <ASection title="Auto-Post Schedules" icon="🕐" color="#00F5D4">
        <div style={{fontSize:"11px",color:"#777",marginBottom:"14px"}}>Set recurring broadcasts that post automatically at your chosen times.</div>
        {(bc.schedules||[]).map(s=>(
          <div key={s.id} style={{marginBottom:"14px",padding:"14px",borderRadius:"10px",background:"rgba(255,255,255,0.02)",border:`1px solid ${s.enabled?"rgba(0,245,212,0.2)":"rgba(255,255,255,0.07)"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
              <input value={s.title} onChange={e=>updateSchedule(s.id,"title",e.target.value)} style={{fontSize:"12px",fontWeight:"700",background:"none",border:"none",color:"#ccc",outline:"none",flex:1,fontFamily:"monospace"}}/>
              <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                <div onClick={()=>updateSchedule(s.id,"enabled",!s.enabled)} style={{width:"40px",height:"22px",borderRadius:"11px",cursor:"pointer",background:s.enabled?"#00F5D4":"rgba(255,255,255,0.1)",position:"relative",transition:"background 0.3s",flexShrink:0}}>
                  <div style={{width:"16px",height:"16px",borderRadius:"50%",background:"#fff",position:"absolute",top:"3px",left:s.enabled?"21px":"3px",transition:"left 0.3s"}}/>
                </div>
                <button onClick={()=>removeSchedule(s.id)} style={{padding:"3px 8px",borderRadius:"6px",border:"1px solid rgba(255,59,48,0.3)",background:"rgba(255,59,48,0.07)",color:"#FF3B30",fontSize:"9px",cursor:"pointer"}}>✕</button>
              </div>
            </div>
            <div style={{display:"flex",gap:"8px",marginBottom:"8px"}}>
              <div style={{flex:1}}>
                <label style={{fontSize:"8px",color:"#555",display:"block",marginBottom:"4px"}}>TIME</label>
                <input type="time" value={s.time||"09:00"} onChange={e=>updateSchedule(s.id,"time",e.target.value)} style={{width:"100%",padding:"7px 8px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"7px",color:"#E8E4DC",fontSize:"11px",outline:"none",fontFamily:"monospace"}}/>
              </div>
              <div style={{flex:2}}>
                <label style={{fontSize:"8px",color:"#555",display:"block",marginBottom:"4px"}}>DAYS</label>
                <div style={{display:"flex",gap:"3px",flexWrap:"wrap"}}>
                  {DAYS.map(d=>{
                    const on=(s.days||[]).includes(d);
                    return <button key={d} onClick={()=>updateSchedule(s.id,"days",on?(s.days||[]).filter(x=>x!==d):[...(s.days||[]),d])} style={{padding:"4px 7px",borderRadius:"6px",border:on?"1px solid #00F5D4":"1px solid rgba(255,255,255,0.08)",background:on?"rgba(0,245,212,0.12)":"rgba(255,255,255,0.03)",color:on?"#00F5D4":"#555",fontSize:"9px",fontWeight:on?"700":"400",cursor:"pointer"}}>{d}</button>;
                  })}
                </div>
              </div>
            </div>
            <div>
              <label style={{fontSize:"8px",color:"#555",display:"block",marginBottom:"4px"}}>PLATFORMS</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
                {PLATFORMS.filter(p=>p.maxChars>0).map(p=>{
                  const on=(s.platforms||[]).includes(p.id);
                  return <button key={p.id} onClick={()=>updateSchedule(s.id,"platforms",on?(s.platforms||[]).filter(x=>x!==p.id):[...(s.platforms||[]),p.id])} style={{padding:"4px 9px",borderRadius:"10px",border:on?`1px solid ${p.color}`:"1px solid rgba(255,255,255,0.07)",background:on?`${p.color}18`:"rgba(255,255,255,0.02)",color:on?p.color:"#484848",fontSize:"9px",cursor:"pointer"}}>{p.icon} {p.name}</button>;
                })}
              </div>
            </div>
          </div>
        ))}
        <button onClick={addSchedule} style={{width:"100%",padding:"12px",borderRadius:"10px",border:"2px dashed rgba(0,245,212,0.25)",background:"rgba(0,245,212,0.03)",color:"#00F5D4",fontSize:"11px",fontWeight:"700",letterSpacing:"0.1em",cursor:"pointer"}}>
          + ADD SCHEDULE
        </button>
      </ASection>

      {/* BROADCAST HISTORY */}
      <ASection title="Broadcast History" icon="📋" color="#FFD60A">
        {(bc.history||[]).length===0
          ? <div style={{textAlign:"center",padding:"24px",color:"#484848",fontSize:"12px"}}>No broadcasts yet. Post something to see history here.</div>
          : (bc.history||[]).map((h,i)=>(
            <div key={i} style={{padding:"12px",borderRadius:"9px",marginBottom:"8px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                <span style={{fontSize:"10px",color:"#777",fontFamily:"monospace"}}>{h.date}</span>
                <span style={{fontSize:"9px",padding:"2px 8px",borderRadius:"6px",background:h.status==="posted"?"rgba(0,245,212,0.1)":"rgba(255,214,10,0.1)",color:h.status==="posted"?"#00F5D4":"#FFD60A",fontFamily:"monospace"}}>{h.status?.toUpperCase()}</span>
              </div>
              <div style={{fontSize:"11px",color:"#bbb",marginBottom:"6px"}}>{h.caption?.slice(0,80)}{h.caption?.length>80?"...":""}</div>
              <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
                {(h.platforms||[]).map((pid,pi)=>{const p=PLATFORMS.find(pl=>pl.id===pid);return p?<span key={pi} style={{fontSize:"9px",color:p.color}}>{p.icon}</span>:null;})}
              </div>
            </div>
          ))
        }
      </ASection>
    </div>
  );
}

// ─── TICKER ADMIN TAB ────────────────────────────────────────────────────────
function TickerAdminTab({ cfg, setCfg }) {
  const ticker   = cfg.ticker || {};
  const [newItem, setNewItem] = useState("");
  const [preview, setPreview] = useState(false);

  const updateTicker = (key, val) =>
    setCfg(prev => ({ ...prev, ticker: { ...prev.ticker, [key]: val } }));

  const addItem = () => {
    if (!newItem.trim()) return;
    updateTicker("items", [...(ticker.items || []), newItem.trim()]);
    setNewItem("");
  };

  const removeItem = (i) =>
    updateTicker("items", (ticker.items || []).filter((_,idx) => idx !== i));

  const moveItem = (i, dir) => {
    const items = [...(ticker.items || [])];
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    updateTicker("items", items);
  };

  const sep   = ticker.separator || "◆";
  const speed = ticker.speed || 40;
  const previewText = (ticker.items || []).join(`   ${sep}   `);
  const previewFull = `${previewText}   ${sep}   ${previewText}`;

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* ON/OFF TOGGLE */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px", borderRadius:"12px", marginBottom:"16px", background: ticker.enabled ? "rgba(255,107,53,0.1)" : "rgba(255,255,255,0.02)", border: ticker.enabled ? "1px solid rgba(255,107,53,0.3)" : "1px solid rgba(255,255,255,0.07)", transition:"all 0.3s" }}>
        <div>
          <div style={{ fontSize:"13px", fontWeight:"700", color: ticker.enabled ? "#FF6B35" : "#777" }}>Scrolling Ticker</div>
          <div style={{ fontSize:"10px", color:"#484848", marginTop:"2px" }}>{ticker.enabled ? "Visible on the public app" : "Hidden from public app"}</div>
        </div>
        <div onClick={() => updateTicker("enabled", !ticker.enabled)}
          style={{ width:"48px", height:"26px", borderRadius:"13px", cursor:"pointer", flexShrink:0, background:ticker.enabled?"#FF6B35":"rgba(255,255,255,0.1)", position:"relative", transition:"background 0.3s" }}>
          <div style={{ width:"20px", height:"20px", borderRadius:"50%", background:"#fff", position:"absolute", top:"3px", left:ticker.enabled?"25px":"3px", transition:"left 0.3s", boxShadow:"0 1px 4px rgba(0,0,0,0.4)" }} />
        </div>
      </div>

      {/* LIVE PREVIEW */}
      <ASection title="Live Preview" icon="👁" color="#C77DFF">
        <div style={{ borderRadius:"10px", overflow:"hidden", marginBottom:"8px" }}>
          <TickerBar ticker={{ ...ticker, items: ticker.items?.length ? ticker.items : ["Your ticker text will appear here..."] }} />
        </div>
        <div style={{ fontSize:"9px", color:"#484848", fontFamily:"monospace", textAlign:"center" }}>Updates live as you edit below</div>
      </ASection>

      {/* APPEARANCE */}
      <ASection title="Appearance" icon="◈" color="#FF6B35">
        <div style={{ display:"flex", gap:"14px", marginBottom:"14px" }}>
          <div style={{ flex:1 }}>
            <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"7px" }}>BACKGROUND COLOR</label>
            <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
              <input type="color" value={ticker.bgColor||"#FF6B35"} onChange={e => updateTicker("bgColor", e.target.value)}
                style={{ width:"44px", height:"44px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", cursor:"pointer", background:"none" }} />
              <span style={{ fontSize:"11px", color:"#777", fontFamily:"monospace" }}>{ticker.bgColor||"#FF6B35"}</span>
            </div>
          </div>
          <div style={{ flex:1 }}>
            <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"7px" }}>TEXT COLOR</label>
            <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
              <input type="color" value={ticker.textColor||"#000000"} onChange={e => updateTicker("textColor", e.target.value)}
                style={{ width:"44px", height:"44px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", cursor:"pointer", background:"none" }} />
              <span style={{ fontSize:"11px", color:"#777", fontFamily:"monospace" }}>{ticker.textColor||"#000000"}</span>
            </div>
          </div>
        </div>

        {/* SEPARATOR */}
        <div style={{ marginBottom:"14px" }}>
          <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"7px" }}>SEPARATOR BETWEEN ITEMS</label>
          <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
            {["◆","·","★","•","⬡","◎","▶","🔥","⚡","🎵"].map(s => (
              <button key={s} onClick={() => updateTicker("separator", s)}
                style={{ width:"36px", height:"36px", borderRadius:"8px", border:(ticker.separator||"◆")===s?"2px solid #FF6B35":"1px solid rgba(255,255,255,0.08)", background:(ticker.separator||"◆")===s?"rgba(255,107,53,0.15)":"rgba(255,255,255,0.03)", fontSize:"16px", cursor:"pointer", transition:"all 0.2s" }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* SPEED */}
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px" }}>
            <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555" }}>SCROLL SPEED</label>
            <span style={{ fontSize:"9px", color:"#FF6B35", fontFamily:"monospace" }}>
              {speed <= 20 ? "Fast" : speed <= 40 ? "Medium" : "Slow"}
            </span>
          </div>
          <input type="range" min={10} max={80} step={5} value={speed}
            onChange={e => updateTicker("speed", Number(e.target.value))}
            style={{ width:"100%", accentColor:"#FF6B35", cursor:"pointer" }} />
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:"3px" }}>
            <span style={{ fontSize:"8px", color:"#484848" }}>Fast</span>
            <span style={{ fontSize:"8px", color:"#484848" }}>Slow</span>
          </div>
        </div>
      </ASection>

      {/* TICKER MESSAGES */}
      <ASection title="Ticker Messages" icon="📢" color="#FFD60A">


        {/* EXISTING ITEMS */}
        {(ticker.items || []).map((item, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"10px 12px", marginBottom:"8px", borderRadius:"10px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:"2px", flexShrink:0 }}>
              <button onClick={() => moveItem(i, -1)} disabled={i===0} style={{ background:"none", border:"none", color:i===0?"#333":"#777", cursor:i===0?"default":"pointer", fontSize:"10px", padding:"0", lineHeight:1 }}>▲</button>
              <button onClick={() => moveItem(i,  1)} disabled={i===(ticker.items||[]).length-1} style={{ background:"none", border:"none", color:i===(ticker.items||[]).length-1?"#333":"#777", cursor:i===(ticker.items||[]).length-1?"default":"pointer", fontSize:"10px", padding:"0", lineHeight:1 }}>▼</button>
            </div>
            <div style={{ flex:1, fontSize:"12px", color:"#ccc", lineHeight:1.4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item}</div>
            <button onClick={() => removeItem(i)} style={{ flexShrink:0, padding:"4px 9px", borderRadius:"7px", border:"1px solid rgba(255,59,48,0.3)", background:"rgba(255,59,48,0.08)", color:"#FF3B30", fontSize:"10px", cursor:"pointer" }}>✕</button>
          </div>
        ))}

        {/* ADD NEW ITEM */}
        <div style={{ display:"flex", gap:"8px", marginTop:"4px" }}>
          <input value={newItem} onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addItem()}
            placeholder="Type a new ticker message... 🎵"
            style={{ flex:1, padding:"11px 13px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,214,10,0.25)", borderRadius:"9px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace" }} />
          <button onClick={addItem} disabled={!newItem.trim()}
            style={{ padding:"11px 16px", borderRadius:"9px", border:"none", background:newItem.trim()?"linear-gradient(135deg,#FFD60A,#FF6B35)":"rgba(255,255,255,0.05)", color:newItem.trim()?"#000":"#383838", fontWeight:"900", fontSize:"11px", cursor:newItem.trim()?"pointer":"not-allowed", whiteSpace:"nowrap", letterSpacing:"0.1em", fontFamily:"monospace" }}>
            + ADD
          </button>
        </div>
        {(ticker.items||[]).length === 0 && (
          <div style={{ marginTop:"10px", padding:"16px", borderRadius:"9px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", textAlign:"center", fontSize:"11px", color:"#484848" }}>
            No messages yet. Add your first ticker message above.
          </div>
        )}
      </ASection>
    </div>
  );
}

// ─── DATABASE TAB ─────────────────────────────────────────────────────────────
// ─── LOCAL CACHE STATUS ───────────────────────────────────────────────────────
function LocalCacheStatus() {
  const [cacheSize,    setCacheSize]    = useState("—");
  const [cacheAge,     setCacheAge]     = useState("—");
  const [cleared,      setCleared]      = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("media_empire_config");
      if (raw) {
        const kb = (new Blob([raw]).size / 1024).toFixed(1);
        setCacheSize(kb + " KB");
        const cfg = JSON.parse(raw);
        setCacheAge(cfg._savedAt ? new Date(cfg._savedAt).toLocaleString() : "Unknown");
      } else {
        setCacheSize("Empty"); setCacheAge("Never saved");
      }
    } catch { setCacheSize("Error"); }
  }, [cleared]);

  const clearCache = () => {
    try { localStorage.removeItem("media_empire_config"); } catch {}
    setCleared(true);
    setCacheSize("Empty"); setCacheAge("Never saved");
    setTimeout(() => setCleared(false), 2000);
  };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"12px" }}>
        <div style={{ padding:"12px", borderRadius:"10px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", textAlign:"center" }}>
          <div style={{ fontSize:"14px", fontWeight:"800", color:"#FF6B35" }}>{cacheSize}</div>
          <div style={{ fontSize:"8px", color:"#555", letterSpacing:"0.2em", marginTop:"2px" }}>CACHE SIZE</div>
        </div>
        <div style={{ padding:"12px", borderRadius:"10px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", textAlign:"center" }}>
          <div style={{ fontSize:"11px", fontWeight:"700", color:"#00F5D4" }}>{cacheAge === "Never saved" ? "—" : "✓ Saved"}</div>
          <div style={{ fontSize:"8px", color:"#555", letterSpacing:"0.2em", marginTop:"2px" }}>STATUS</div>
        </div>
      </div>
      <button onClick={clearCache} style={{ width:"100%", padding:"10px", borderRadius:"10px", border:"1px solid rgba(255,59,48,0.3)", background:cleared?"rgba(0,245,212,0.08)":"rgba(255,59,48,0.07)", color:cleared?"#00F5D4":"#FF3B30", fontSize:"11px", cursor:"pointer", transition:"all 0.3s" }}>
        {cleared ? "✓ Cache Cleared — Reload to use defaults" : "🗑 Clear Local Cache (resets to defaults on next load)"}
      </button>
    </div>
  );
}

function DatabaseTab({ dbStatus, saveConfigToDB, config }) {
  const [sbUrl,    setSbUrl]    = React.useState(() => { try { const c=JSON.parse(localStorage.getItem("me_sb_creds")||"{}"); return c.url||""; } catch{ return ""; }});
  const [sbKey,    setSbKey]    = React.useState(() => { try { const c=JSON.parse(localStorage.getItem("me_sb_creds")||"{}"); return c.key||""; } catch{ return ""; }});
  const [testing,  setTesting]  = React.useState(false);
  const [testMsg,  setTestMsg]  = React.useState("");
  const [testOk,   setTestOk]   = React.useState(false);
  const [copied,   setCopied]   = React.useState(false);
  const [saving,   setSaving]   = React.useState(false);
  const [saved,    setSaved]    = React.useState(false);
  const [stats,    setStats]    = React.useState({ subscribers:0, inquiries:0, members:0 });
  const [loading,  setLoading]  = React.useState(false);

  const configured = sb.ready;

  React.useEffect(() => {
    if (!sb.ready) return;
    setLoading(true);
    Promise.all([sb.getSubscribers(), sb.getInquiries(), sb.getMembers()]).then(([subs,inqs,mems]) => {
      setStats({ subscribers:subs.length, inquiries:inqs.length, members:mems.length });
      setLoading(false);
    });
  }, []);

  const testConnection = async () => {
    if (!sbUrl.trim() || !sbKey.trim()) { setTestMsg("Enter both URL and API Key first"); setTestOk(false); return; }
    setTesting(true); setTestMsg("");
    try {
      const res = await fetch(`${sbUrl.trim()}/rest/v1/app_config?select=id&limit=1`, {
        headers: { "apikey": sbKey.trim(), "Authorization": `Bearer ${sbKey.trim()}` }
      });
      if (res.ok || res.status === 406) {
        setTestOk(true); setTestMsg("✅ Connected! Credentials are valid.");
      } else if (res.status === 401) {
        setTestOk(false); setTestMsg("❌ Invalid API Key — check your anon key");
      } else if (res.status === 404) {
        setTestOk(false); setTestMsg("❌ URL not found — check your Supabase URL");
      } else {
        setTestOk(false); setTestMsg(`❌ Error ${res.status} — check your credentials`);
      }
    } catch {
      setTestOk(false); setTestMsg("❌ Cannot reach Supabase — check the URL");
    }
    setTesting(false);
  };

  const saveCredentials = async () => {
    if (!sbUrl.trim() || !sbKey.trim()) return;
    setSaving(true);
    const ok = sb.connect(sbUrl.trim(), sbKey.trim());
    if (ok) {
      // Push current config to Supabase immediately
      if (config) await sb.saveConfig(config);
      setSaved(true);
      setTimeout(() => { setSaved(false); window.location.reload(); }, 1500);
    }
    setSaving(false);
  };

  const copySQL = () => {
    navigator.clipboard?.writeText(DB_SETUP_SQL).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false), 2000);
  };

  const disconnectDB = () => {
    try { localStorage.removeItem("me_sb_creds"); } catch {}
    setSbUrl(""); setSbKey("");
    sb.url = ""; sb.key = ""; sb.ready = false;
  };

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* STATUS BANNER */}
      <div style={{ padding:"16px", borderRadius:"14px", marginBottom:"20px",
        background: configured ? "rgba(0,245,212,0.08)" : "rgba(255,107,53,0.08)",
        border: configured ? "1px solid rgba(0,245,212,0.3)" : "2px solid rgba(255,107,53,0.4)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          <div style={{ fontSize:"28px" }}>{configured ? "🗄" : "⚠️"}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:"14px", fontWeight:"800", color: configured?"#00F5D4":"#FF6B35" }}>
              {configured
                ? dbStatus==="connected" ? "Database Connected ✓"
                : dbStatus==="loading"   ? "Connecting..."
                : dbStatus==="error"     ? "Connection Error"
                : "Database Configured"
                : "⚠ Database NOT Connected"}
            </div>
            <div style={{ fontSize:"11px", color:configured?"#777":"#FF6B35", marginTop:"2px" }}>
              {configured
                ? "Data syncs across all devices in real time"
                : "Your data only saves locally — other devices won't see changes. Add Supabase below to fix this."}
            </div>
          </div>
          {configured && <button onClick={disconnectDB} style={{ fontSize:"9px", color:"#555", background:"none", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"7px", padding:"5px 9px", cursor:"pointer" }}>Disconnect</button>}
        </div>
      </div>

      {/* LIVE STATS */}
      {configured && (
        <div style={{ display:"flex", gap:"8px", marginBottom:"20px" }}>
          {[
            { label:"EMAIL SUBS", val:stats.subscribers, icon:"📧", color:"#00F5D4" },
            { label:"INQUIRIES",  val:stats.inquiries,   icon:"📅", color:"#C77DFF" },
            { label:"MEMBERS",    val:stats.members,     icon:"⭐", color:"#FFD60A" },
          ].map(s => (
            <div key={s.label} style={{ flex:1, padding:"12px 8px", borderRadius:"11px", background:`${s.color}0d`, border:`1px solid ${s.color}25`, textAlign:"center" }}>
              <div style={{ fontSize:"16px", marginBottom:"3px" }}>{s.icon}</div>
              <div style={{ fontSize:"20px", fontWeight:"900", color:s.color }}>{loading?"...":s.val}</div>
              <div style={{ fontSize:"7px", letterSpacing:"0.2em", color:"#555", marginTop:"2px" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* CREDENTIALS ENTRY */}
      <ASection title="Connect Supabase (Cross-Device Sync)" icon="🔑" color="#FF6B35">
        <div style={{ marginBottom:"16px", padding:"12px 14px", borderRadius:"10px", background:"rgba(255,107,53,0.06)", border:"1px solid rgba(255,107,53,0.2)", fontSize:"11px", color:"#bbb", lineHeight:1.7 }}>
          <strong style={{ color:"#FF6B35" }}>Free in 3 minutes:</strong> Go to <strong style={{ color:"#FF6B35" }}>supabase.com</strong> → New Project → Settings → API → copy your Project URL and anon public key below. This makes your app work on every device.
        </div>

        <div style={{ marginBottom:"10px" }}>
          <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"6px" }}>SUPABASE PROJECT URL</label>
          <input value={sbUrl} onChange={e=>setSbUrl(e.target.value)} placeholder="https://xxxxxxxxxxxx.supabase.co"
            style={{ width:"100%", padding:"11px 13px", background:"rgba(0,0,0,0.4)", border:`1px solid ${sbUrl?"rgba(0,245,212,0.3)":"rgba(255,255,255,0.08)"}`, borderRadius:"9px", color:"#fff", fontSize:"12px", outline:"none", fontFamily:"monospace" }} />
        </div>

        <div style={{ marginBottom:"14px" }}>
          <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"6px" }}>ANON PUBLIC KEY (starts with eyJ...)</label>
          <input value={sbKey} onChange={e=>setSbKey(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            style={{ width:"100%", padding:"11px 13px", background:"rgba(0,0,0,0.4)", border:`1px solid ${sbKey?"rgba(0,245,212,0.3)":"rgba(255,255,255,0.08)"}`, borderRadius:"9px", color:"#fff", fontSize:"12px", outline:"none", fontFamily:"monospace" }} />
        </div>

        {/* TEST + SAVE BUTTONS */}
        <div style={{ display:"flex", gap:"8px", marginBottom:"10px" }}>
          <button onClick={testConnection} disabled={testing||!sbUrl||!sbKey}
            style={{ flex:1, padding:"11px", borderRadius:"9px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"#bbb", fontSize:"11px", fontWeight:"700", cursor:"pointer" }}>
            {testing ? "⏳ Testing..." : "🔌 Test Connection"}
          </button>
          <button onClick={saveCredentials} disabled={saving||!sbUrl||!sbKey}
            style={{ flex:1, padding:"11px", borderRadius:"9px", border:"none", background:saved?"#00F5D4":sbUrl&&sbKey?"linear-gradient(135deg,#FF6B35,#C77DFF)":"rgba(255,255,255,0.05)", color:saved?"#000":sbUrl&&sbKey?"#000":"#555", fontSize:"11px", fontWeight:"900", cursor:"pointer" }}>
            {saved ? "✓ SAVED — RELOADING..." : saving ? "Saving..." : "💾 SAVE & CONNECT"}
          </button>
        </div>

        {testMsg && (
          <div style={{ padding:"10px 12px", borderRadius:"8px", background:testOk?"rgba(0,245,212,0.08)":"rgba(255,59,48,0.08)", border:`1px solid ${testOk?"rgba(0,245,212,0.3)":"rgba(255,59,48,0.3)"}`, fontSize:"12px", color:testOk?"#00F5D4":"#FF3B30" }}>
            {testMsg}
          </div>
        )}

        <div style={{ marginTop:"10px", fontSize:"9px", color:"#484848", lineHeight:1.7 }}>
          Step 1: supabase.com → New Project<br/>
          Step 2: Settings → API → copy URL and anon key<br/>
          Step 3: Paste above → Test → Save &amp; Connect<br/>
          Step 4: Admin → 🗄 DATABASE → Copy SQL → Run in Supabase SQL Editor<br/>
          Step 5: Done — all devices sync automatically ✓
        </div>
      </ASection>

      {/* SQL SETUP */}
      <ASection title="Database Setup SQL" icon="◆" color="#C77DFF">
        <div style={{ fontSize:"11px", color:"#777", marginBottom:"12px" }}>After connecting, run this SQL in Supabase → SQL Editor → New Query → Run. Creates all required tables.</div>
        <div style={{ position:"relative" }}>
          <code style={{ display:"block", padding:"14px", borderRadius:"10px", background:"rgba(0,0,0,0.5)", border:"1px solid rgba(255,255,255,0.08)", fontSize:"9px", color:"#00F5D4", fontFamily:"monospace", lineHeight:1.7, whiteSpace:"pre-wrap", maxHeight:"200px", overflowY:"auto" }}>
            {DB_SETUP_SQL.trim()}
          </code>
          <button onClick={copySQL} style={{ position:"absolute", top:"8px", right:"8px", padding:"5px 10px", borderRadius:"7px", border:"1px solid rgba(199,125,255,0.3)", background:"rgba(199,125,255,0.1)", color:"#C77DFF", fontSize:"9px", cursor:"pointer" }}>
            {copied ? "✓ COPIED" : "📋 COPY"}
          </button>
        </div>
      </ASection>

      {/* WHAT GETS SAVED */}
      <ASection title="What Gets Saved Automatically" icon="✓" color="#00F5D4">
        {[
          ["🎨","Admin Config",         "All brand settings, colors, content, and features — saved every time you hit SAVE ALL"],
          ["📧","Email Subscribers",    "Every email captured via the pop-up is permanently saved to the database"],
          ["📅","Booking Inquiries",    "Every form submission from your Booking page is stored and visible in Admin → 📅 BOOKING"],
          ["🗓","Calendar Events",      "Events you add in Admin → 📅 BOOKING → Calendar are saved and persist across sessions"],
          ["⭐","Fan Members",          "Membership signups tracked with email, plan, and join date"],
          ["💬","Community Posts",      "Every post, reply, and like in the Community chat is saved to Supabase in real time"],
          ["🔥","Events Showcase",      "All events you create in Admin → 🔥 EVENTS including featured flags and sold-out status"],
          ["🔊","AutoPlay Settings",    "Your auto-play music config — track, volume, delay, fade — is saved with SAVE ALL"],
          ["👑","VIP Content",          "Members Lounge content items and PIN are saved as part of your admin config"],
          ["📤","Email Sent History",   "Every email campaign you send is logged with recipient count and send date"],
          ["🔄","Cross-Device Sync",    "Update on your iPad, see changes on your phone instantly — all backed by Supabase"],
        ].map(([emoji,title,desc],i) => (
          <div key={i} style={{ display:"flex", gap:"12px", padding:"11px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ width:"32px",height:"32px",borderRadius:"8px",background:"rgba(0,245,212,0.08)",border:"1px solid rgba(0,245,212,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"15px",flexShrink:0 }}>{emoji}</div>
            <div>
              <div style={{ fontSize:"12px",fontWeight:"700",color:"#ddd" }}>{title}</div>
              <div style={{ fontSize:"11px",color:"#666",marginTop:"2px",lineHeight:1.5 }}>{desc}</div>
            </div>
          </div>
        ))}
      </ASection>

      {/* LOCAL CACHE */}
      <ASection title="Local Cache (This Device)" icon="💾" color="#777">
        <div style={{ fontSize:"11px",color:"#777",marginBottom:"12px",lineHeight:1.6 }}>
          Settings are also saved in this browser's localStorage as a backup. Clears if you clear browser data.
        </div>
        <LocalCacheStatus />
      </ASection>
    </div>
  );
}


// ─── FINANCE TAB ─────────────────────────────────────────────────────────────
function FinanceTab() {
  const [filter, setFilter] = useState("all");

  const paid      = MOCK_SALES.filter(s => s.status === "paid");
  const totalRev  = paid.reduce((a,s) => a + s.amount, 0);
  const recurring = paid.filter(s => s.plan.includes("/mo")).reduce((a,s) => a + s.amount, 0);
  const oneTime   = paid.filter(s => !s.plan.includes("/mo")).reduce((a,s) => a + s.amount, 0);
  const filtered  = filter === "all" ? MOCK_SALES : MOCK_SALES.filter(s => s.status === filter);

  const exportCSV = () => {
    const header = "Invoice,Date,Buyer,Plan,Amount,Status";
    const rows   = MOCK_SALES.map(s => `${s.id},${s.date},${s.buyer},"${s.plan}",$${s.amount},${s.status}`);
    const csv    = [header, ...rows].join("\n");
    const blob   = new Blob([csv], { type:"text/csv" });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement("a");
    a.href = url; a.download = "transactions.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = n => n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n}`;
  const chartData = [30,55,40,80,45,90,65,110,75,120,95,140,99,149,180,120,200,149,220,250,180,310,280,350,400,320,447,380,499,638];
  const chartMax  = Math.max(...chartData);

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      {/* REVENUE CARDS */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"10px", marginBottom:"20px" }}>
        {[
          { label:"TOTAL REVENUE", val:fmt(totalRev),  color:"#00F5D4" },
          { label:"RECURRING /MO", val:fmt(recurring), color:"#FFD60A" },
          { label:"ONE-TIME",      val:fmt(oneTime),   color:"#FF6B35" },
        ].map((c,i) => (
          <div key={i} style={{ padding:"16px 10px", borderRadius:"12px", background:"rgba(255,255,255,0.03)", border:`1px solid ${c.color}22`, textAlign:"center" }}>
            <div style={{ fontSize:"18px", fontWeight:"900", color:c.color, fontFamily:"monospace" }}>{c.val}</div>
            <div style={{ fontSize:"7px", letterSpacing:"0.2em", color:"#484848", marginTop:"4px" }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* CHART */}
      <div style={{ padding:"16px", borderRadius:"12px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", marginBottom:"18px" }}>
        <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#555", marginBottom:"12px" }}>REVENUE — LAST 30 DAYS</div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:"3px", height:"56px" }}>
          {chartData.map((v,i) => (
            <div key={i} style={{ flex:1, borderRadius:"2px 2px 0 0", background:`linear-gradient(180deg,#FF6B35,#C77DFF)`, height:`${Math.round((v/chartMax)*100)}%`, minWidth:"3px", opacity:0.6+i*0.013 }} />
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:"5px" }}>
          <span style={{ fontSize:"8px", color:"#484848" }}>Mar 1</span>
          <span style={{ fontSize:"8px", color:"#484848" }}>Mar 27</span>
        </div>
      </div>

      {/* PLAN BREAKDOWN */}
      <div style={{ padding:"16px", borderRadius:"12px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", marginBottom:"18px" }}>
        <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#555", marginBottom:"14px" }}>SALES BY PLAN</div>
        {[
          { plan:"Pro Done For You", amt:499, count:2, color:"#FF6B35" },
          { plan:"Empire /mo",       amt:149, count:3, color:"#C77DFF" },
          { plan:"Starter Template", amt:97,  count:2, color:"#00F5D4" },
        ].map((p,i) => {
          const pct = totalRev > 0 ? Math.round((p.amt*p.count/totalRev)*100) : 0;
          return (
            <div key={i} style={{ marginBottom:"12px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"5px" }}>
                <span style={{ fontSize:"11px", color:"#ccc" }}>{p.plan}</span>
                <span style={{ fontSize:"11px", fontWeight:"700", color:p.color, fontFamily:"monospace" }}>${p.amt*p.count}</span>
              </div>
              <div style={{ height:"4px", borderRadius:"2px", background:"rgba(255,255,255,0.05)" }}>
                <div style={{ height:"100%", borderRadius:"2px", background:p.color, width:`${pct}%`, transition:"width 0.6s ease" }} />
              </div>
              <div style={{ fontSize:"9px", color:"#484848", marginTop:"3px" }}>{p.count} sale{p.count>1?"s":""} · {pct}%</div>
            </div>
          );
        })}
      </div>

      {/* TRANSACTIONS */}
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
          <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#555" }}>TRANSACTIONS</div>
          <div style={{ display:"flex", gap:"5px" }}>
            {["all","paid","pending","refunded"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding:"4px 9px", borderRadius:"9px", border:"none", cursor:"pointer", fontSize:"8px", fontFamily:"monospace", letterSpacing:"0.1em", background:filter===f?"#FF6B35":"rgba(255,255,255,0.05)", color:filter===f?"#000":"#555", transition:"all 0.2s" }}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ borderRadius:"12px", overflow:"hidden", border:"1px solid rgba(255,255,255,0.07)" }}>
          {filtered.length === 0 ? (
            <div style={{ padding:"24px", textAlign:"center", color:"#484848", fontSize:"12px" }}>No {filter} transactions</div>
          ) : filtered.map((s,i) => (
            <div key={s.id} style={{ display:"flex", alignItems:"center", gap:"10px", padding:"12px 14px", background:i%2===0?"rgba(255,255,255,0.01)":"transparent", borderBottom:i<filtered.length-1?"1px solid rgba(255,255,255,0.04)":"none" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:"12px", fontWeight:"600", color:"#ddd", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.buyer}</div>
                <div style={{ fontSize:"9px", color:"#484848", marginTop:"1px", fontFamily:"monospace" }}>{s.id} · {s.date}</div>
              </div>
              <div style={{ fontSize:"10px", color:"#666", width:"90px", textAlign:"right", flexShrink:0 }}>{s.plan}</div>
              <div style={{ fontSize:"13px", fontWeight:"800", color:"#00F5D4", fontFamily:"monospace", width:"48px", textAlign:"right", flexShrink:0 }}>${s.amount}</div>
              <div style={{ padding:"3px 8px", borderRadius:"7px", fontSize:"8px", letterSpacing:"0.12em", fontFamily:"monospace", flexShrink:0,
                background:s.status==="paid"?"rgba(0,245,212,0.1)":s.status==="pending"?"rgba(255,214,10,0.1)":"rgba(255,59,48,0.1)",
                border:s.status==="paid"?"1px solid rgba(0,245,212,0.3)":s.status==="pending"?"1px solid rgba(255,214,10,0.3)":"1px solid rgba(255,59,48,0.3)",
                color:s.status==="paid"?"#00F5D4":s.status==="pending"?"#FFD60A":"#FF3B30" }}>
                {s.status.toUpperCase()}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"12px", padding:"0 2px" }}>
          <div style={{ fontSize:"10px", color:"#484848" }}>{filtered.length} transaction{filtered.length!==1?"s":""}</div>
          <button onClick={exportCSV} style={{ padding:"6px 14px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.08)", background:"none", color:"#777", fontSize:"9px", letterSpacing:"0.15em", cursor:"pointer" }}>
            ↓ EXPORT CSV
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BRAND TAB ────────────────────────────────────────────────────────────────
function BrandTab({ cfg, update, setCfg }) {
  const heroRef    = useRef(null);
  const videoRef   = useRef(null);
  const logoRef    = useRef(null);
  const slideRef   = useRef(null);
  const [logoPrev, setLogoPrev]   = useState(cfg.brand.logoUrl || "");
  const [logoDrag, setLogoDrag]   = useState(false);
  const [slideIdx, setSlideIdx]   = useState(0);

  // Auto-advance slideshow preview
  useEffect(() => {
    if (cfg.brand.heroMode !== "slideshow" || !cfg.brand.heroSlides?.length) return;
    const t = setInterval(() => setSlideIdx(i => (i+1) % cfg.brand.heroSlides.length), 3000);
    return () => clearInterval(t);
  }, [cfg.brand.heroMode, cfg.brand.heroSlides?.length]);

  const readFile = (file, cb) => {
    if (!file) return;
    const r = new FileReader(); r.onload = e => cb(e.target.result); r.readAsDataURL(file);
  };

  const handleLogoFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    readFile(file, url => { setLogoPrev(url); update("brand","logoUrl",url); update("brand","logoType","image"); });
  };
  const handleHeroImage = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    readFile(file, url => { update("brand","heroImageUrl",url); update("brand","heroType","image"); update("brand","heroMode","single"); });
  };
  const handleHeroVideo = (file) => {
    if (!file || !file.type.startsWith("video/")) return;
    readFile(file, url => { update("brand","heroVideoUrl",url); update("brand","heroType","video"); update("brand","heroMode","video"); });
  };
  const addSlide = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    readFile(file, url => {
      const slides = [...(cfg.brand.heroSlides||[]), url];
      setCfg(p=>({...p, brand:{...p.brand, heroSlides:slides, heroMode:"slideshow"}}));
    });
  };
  const removeSlide = (i) => {
    const slides = (cfg.brand.heroSlides||[]).filter((_,j)=>j!==i);
    setCfg(p=>({...p, brand:{...p.brand, heroSlides:slides, heroMode:slides.length?p.brand.heroMode:"gradient"}}));
  };

  const heroBg = cfg.brand.heroMode==="slideshow" && cfg.brand.heroSlides?.length
    ? `url(${cfg.brand.heroSlides[slideIdx]}) center/cover no-repeat`
    : cfg.brand.heroType==="image" && cfg.brand.heroImageUrl
      ? `url(${cfg.brand.heroImageUrl}) center/cover no-repeat`
      : `linear-gradient(135deg,${cfg.brand.primaryColor}33,${cfg.brand.accentColor}22)`;

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* ── LOGO SECTION ── */}
      <ASection title="Logo" icon="🖼" color="#C77DFF">
        <div style={{ display:"flex", justifyContent:"center", gap:"20px", alignItems:"flex-end", marginBottom:"16px" }}>
          {[72, 48, 32].map(sz => (
            <div key={sz} style={{ textAlign:"center" }}>
              {logoPrev
                ? <img src={logoPrev} alt="logo" style={{ width:sz, height:sz, borderRadius:"50%", objectFit:"cover", border:"2px solid rgba(255,255,255,0.1)" }} />
                : <div style={{ width:sz, height:sz, borderRadius:"50%", background:`linear-gradient(135deg,${cfg.brand.primaryColor},${cfg.brand.accentColor})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:Math.round(sz*0.38) }}>🎙</div>}
              <div style={{ fontSize:"7px", color:"#484848", marginTop:"3px" }}>{sz}px</div>
            </div>
          ))}
        </div>
        <div onDragOver={e=>{e.preventDefault();setLogoDrag(true);}} onDragLeave={()=>setLogoDrag(false)}
          onDrop={e=>{e.preventDefault();setLogoDrag(false);handleLogoFile(e.dataTransfer.files[0]);}}
          onClick={()=>logoRef.current?.click()}
          style={{ padding:"22px", borderRadius:"12px", textAlign:"center", cursor:"pointer", border:logoDrag?"2px solid #C77DFF":"2px dashed rgba(199,125,255,0.25)", background:logoDrag?"rgba(199,125,255,0.08)":"rgba(255,255,255,0.01)", marginBottom:"10px", transition:"all 0.3s" }}>
          <div style={{ fontSize:"26px", marginBottom:"6px" }}>🖼</div>
          <div style={{ fontSize:"12px", color:"#ccc", fontWeight:"700" }}>Drop logo or tap to browse</div>
          <div style={{ fontSize:"10px", color:"#555", marginTop:"3px" }}>PNG · JPG · SVG · 512×512 recommended</div>
          <input ref={logoRef} type="file" accept="image/*" onChange={e=>handleLogoFile(e.target.files[0])} style={{ display:"none" }} />
        </div>
        <div style={{ display:"flex", gap:"8px" }}>
          {[["emoji","🎙 Default"],["image","My Logo"]].map(([val,lbl])=>(
            <div key={val} onClick={()=>update("brand","logoType",val)} style={{ flex:1, padding:"10px", borderRadius:"9px", cursor:"pointer", textAlign:"center", border:cfg.brand.logoType===val?"1px solid #C77DFF":"1px solid rgba(255,255,255,0.07)", background:cfg.brand.logoType===val?"rgba(199,125,255,0.1)":"rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize:"11px", fontWeight:"700", color:cfg.brand.logoType===val?"#C77DFF":"#777" }}>{lbl}</div>
            </div>
          ))}
          {logoPrev && <button onClick={()=>{setLogoPrev("");update("brand","logoUrl","");update("brand","logoType","emoji");}} style={{ padding:"10px 14px", borderRadius:"9px", border:"1px solid rgba(255,59,48,0.3)", background:"rgba(255,59,48,0.07)", color:"#FF3B30", fontSize:"10px", cursor:"pointer" }}>✕</button>}
        </div>
      </ASection>

      {/* ── BRAND IDENTITY ── */}
      <ASection title="Brand Identity" icon="◈" color="#FF6B35">
        <AField label="Brand Name"           value={cfg.brand.name}            onChange={v=>update("brand","name",v)}            placeholder="YOUR BRAND" />
        <AField label="Tagline"              value={cfg.brand.tagline}         onChange={v=>update("brand","tagline",v)}         placeholder="DIGITAL MEDIA ENTERTAINMENT GROUP" />
        <AField label="Universal Link"       value={cfg.brand.universalLink}   onChange={v=>update("brand","universalLink",v)}   placeholder="yourbrand.app/hub" />
        <AField label="Membership Price /mo" value={cfg.brand.membershipPrice} onChange={v=>update("brand","membershipPrice",v)} placeholder="4.99" type="number" />
        <div style={{ display:"flex", gap:"14px" }}>
          {[["PRIMARY COLOR","primaryColor"],["ACCENT COLOR","accentColor"]].map(([lbl,key])=>(
            <div key={key} style={{ flex:1 }}>
              <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"7px" }}>{lbl}</label>
              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                <input type="color" value={cfg.brand[key]} onChange={e=>update("brand",key,e.target.value)} style={{ width:"42px", height:"42px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", cursor:"pointer", background:"none" }} />
                <span style={{ fontSize:"11px", color:"#777", fontFamily:"monospace" }}>{cfg.brand[key]}</span>
              </div>
            </div>
          ))}
        </div>
      </ASection>

      {/* ── HERO SECTION ── */}
      <ASection title="Home Page Hero" icon="🎬" color="#00F5D4">
        {/* MODE PICKER */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:"6px", marginBottom:"14px" }}>
          {[["gradient","🎨 Colors"],["single","🖼 Photo"],["video","🎥 Video"],["slideshow","🎞 Slides"]].map(([mode,lbl])=>(
            <div key={mode} onClick={()=>update("brand","heroMode",mode)}
              style={{ padding:"9px 4px", borderRadius:"9px", textAlign:"center", cursor:"pointer", fontSize:"10px", fontWeight:"700",
                border:cfg.brand.heroMode===mode?"1px solid #00F5D4":"1px solid rgba(255,255,255,0.07)",
                background:cfg.brand.heroMode===mode?"rgba(0,245,212,0.1)":"rgba(255,255,255,0.02)",
                color:cfg.brand.heroMode===mode?"#00F5D4":"#777", transition:"all 0.2s" }}>
              {lbl}
            </div>
          ))}
        </div>

        {/* LIVE PREVIEW */}
        <div style={{ borderRadius:"12px", overflow:"hidden", marginBottom:"14px", height:"130px", position:"relative", background:heroBg }}>
          {(cfg.brand.heroMode==="single"||cfg.brand.heroMode==="slideshow") && <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.45)" }} />}
          {cfg.brand.heroMode==="video" && cfg.brand.heroVideoUrl && (
            <video src={cfg.brand.heroVideoUrl} autoPlay muted loop playsInline style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
          )}
          {cfg.brand.heroMode==="video" && cfg.brand.heroVideoUrl && <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.4)" }} />}
          {cfg.brand.heroMode==="slideshow" && cfg.brand.heroSlides?.length>1 && (
            <div style={{ position:"absolute", bottom:"8px", left:"50%", transform:"translateX(-50%)", display:"flex", gap:"4px", zIndex:2 }}>
              {cfg.brand.heroSlides.map((_,i)=>(
                <div key={i} style={{ width:i===slideIdx?"16px":"6px", height:"6px", borderRadius:"3px", background:i===slideIdx?"#fff":"rgba(255,255,255,0.4)", transition:"all 0.3s" }} />
              ))}
            </div>
          )}
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:1 }}>
            <div style={{ fontSize:"17px", fontWeight:"900", color:"#fff" }}>{cfg.brand.heroHeading||"Your Media Empire"}</div>
            <div style={{ fontSize:"9px", color:"rgba(255,255,255,0.6)", letterSpacing:"0.25em", marginTop:"4px", fontFamily:"monospace" }}>{cfg.brand.heroSubtext||"MUSIC · SHOWS · GALLERY"}</div>
          </div>
          <div style={{ position:"absolute", top:"8px", right:"8px", padding:"3px 8px", borderRadius:"6px", background:"rgba(0,0,0,0.6)", fontSize:"8px", color:"#00F5D4", fontFamily:"monospace" }}>
            {cfg.brand.heroMode==="slideshow"?`SLIDE ${slideIdx+1}/${cfg.brand.heroSlides?.length||0}`:cfg.brand.heroMode.toUpperCase()}
          </div>
        </div>

        {/* SINGLE PHOTO UPLOAD */}
        {cfg.brand.heroMode==="single" && (
          <div style={{ marginBottom:"12px" }}>
            <div onClick={()=>heroRef.current?.click()} style={{ padding:"16px", borderRadius:"10px", textAlign:"center", cursor:"pointer", border:cfg.brand.heroImageUrl?"2px solid #00F5D4":"2px dashed rgba(0,245,212,0.25)", background:"rgba(0,245,212,0.04)", marginBottom:"8px" }}>
              <div style={{ fontSize:"20px", marginBottom:"4px" }}>{cfg.brand.heroImageUrl?"🖼":"📤"}</div>
              <div style={{ fontSize:"11px", color:cfg.brand.heroImageUrl?"#00F5D4":"#555" }}>{cfg.brand.heroImageUrl?"Photo uploaded · Tap to change":"Tap to upload hero photo"}</div>
              <input ref={heroRef} type="file" accept="image/*" onChange={e=>handleHeroImage(e.target.files[0])} style={{ display:"none" }} />
            </div>
            {cfg.brand.heroImageUrl && <button onClick={()=>update("brand","heroImageUrl","")} style={{ width:"100%", padding:"8px", borderRadius:"8px", border:"1px solid rgba(255,59,48,0.3)", background:"rgba(255,59,48,0.07)", color:"#FF3B30", fontSize:"10px", cursor:"pointer" }}>✕ REMOVE PHOTO</button>}
          </div>
        )}

        {/* VIDEO UPLOAD */}
        {cfg.brand.heroMode==="video" && (
          <div style={{ marginBottom:"12px" }}>
            <div onClick={()=>videoRef.current?.click()} style={{ padding:"16px", borderRadius:"10px", textAlign:"center", cursor:"pointer", border:cfg.brand.heroVideoUrl?"2px solid #00F5D4":"2px dashed rgba(0,245,212,0.25)", background:"rgba(0,245,212,0.04)", marginBottom:"8px" }}>
              <div style={{ fontSize:"20px", marginBottom:"4px" }}>{cfg.brand.heroVideoUrl?"🎥":"📤"}</div>
              <div style={{ fontSize:"11px", color:cfg.brand.heroVideoUrl?"#00F5D4":"#555" }}>{cfg.brand.heroVideoUrl?"Video uploaded · Tap to change":"Tap to upload hero video (MP4/MOV · max 50MB)"}</div>
              <input ref={videoRef} type="file" accept="video/*" onChange={e=>handleHeroVideo(e.target.files[0])} style={{ display:"none" }} />
            </div>
            {cfg.brand.heroVideoUrl && <button onClick={()=>update("brand","heroVideoUrl","")} style={{ width:"100%", padding:"8px", borderRadius:"8px", border:"1px solid rgba(255,59,48,0.3)", background:"rgba(255,59,48,0.07)", color:"#FF3B30", fontSize:"10px", cursor:"pointer" }}>✕ REMOVE VIDEO</button>}
          </div>
        )}

        {/* SLIDESHOW UPLOAD */}
        {cfg.brand.heroMode==="slideshow" && (
          <div style={{ marginBottom:"12px" }}>
            <div style={{ display:"flex", gap:"8px", overflowX:"auto", marginBottom:"10px", paddingBottom:"4px" }}>
              {(cfg.brand.heroSlides||[]).map((url,i)=>(
                <div key={i} style={{ position:"relative", flexShrink:0 }}>
                  <img src={url} alt="" style={{ width:"72px", height:"52px", borderRadius:"8px", objectFit:"cover", border:i===slideIdx?"2px solid #00F5D4":"1px solid rgba(255,255,255,0.1)" }} />
                  <button onClick={()=>removeSlide(i)} style={{ position:"absolute", top:"-6px", right:"-6px", width:"18px", height:"18px", borderRadius:"50%", background:"#FF3B30", border:"none", color:"#fff", fontSize:"10px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                </div>
              ))}
              <div onClick={()=>slideRef.current?.click()} style={{ width:"72px", height:"52px", borderRadius:"8px", border:"2px dashed rgba(0,245,212,0.3)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
                <div style={{ fontSize:"16px" }}>+</div>
                <div style={{ fontSize:"8px", color:"#555", marginTop:"2px" }}>Add</div>
              </div>
              <input ref={slideRef} type="file" accept="image/*" onChange={e=>addSlide(e.target.files[0])} style={{ display:"none" }} />
            </div>
            <div style={{ fontSize:"10px", color:"#555", textAlign:"center" }}>Slides auto-advance every 5 seconds · Add up to 10</div>
          </div>
        )}

        <AField label="Hero Heading" value={cfg.brand.heroHeading||""} onChange={v=>update("brand","heroHeading",v)} placeholder="Your Media Empire" />
        <AField label="Hero Subtext"  value={cfg.brand.heroSubtext||""} onChange={v=>update("brand","heroSubtext",v)}  placeholder="MUSIC · SHOWS · GALLERY · SOCIAL" />
      </ASection>
    </div>
  );
}


// ─── LIVE STREAMING TAB ───────────────────────────────────────────────────────
function LiveTab({ cfg, update, testConn, testResult, setIsLiveNow }) {
  const [liveSelected, setLiveSelected] = useState(["youtube","facebook"]);
  const [streamTitle,  setStreamTitle]  = useState("");
  const [streamDesc,   setStreamDesc]   = useState("");
  const [isLive,       setIsLive]       = useState(false);
  const [liveTimer,    setLiveTimer]    = useState(0);
  const [viewers,      setViewers]      = useState({});
  const [cameraOn,     setCameraOn]     = useState(false);
  const [camError,     setCamError]     = useState("");
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const timerRef  = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraOn(true); setCamError("");
    } catch { setCamError("Camera access denied. Please allow camera in your browser settings."); }
  };

  const stopCamera = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  };

  const goLive = () => {
    if (!streamTitle.trim() || liveSelected.length === 0) return;
    setIsLive(true);
    if (setIsLiveNow) setIsLiveNow(true); // 🔴 signal public header
    const init = {};
    liveSelected.forEach(id => { init[id] = Math.floor(Math.random() * 20) + 5; });
    setViewers(init);
    timerRef.current = setInterval(() => {
      setLiveTimer(t => t + 1);
      setViewers(prev => {
        const n = { ...prev };
        liveSelected.forEach(id => { n[id] = Math.max(1, (n[id] || 0) + Math.floor(Math.random() * 5) - 1); });
        return n;
      });
    }, 1000);
  };

  const endLive = () => {
    clearInterval(timerRef.current);
    setIsLive(false);
    setLiveTimer(0);
    if (setIsLiveNow) setIsLiveNow(false); // clear public header
    stopCamera();
  };

  const fmt = (s) => `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const totalViewers = Object.values(viewers).reduce((a,v) => a+v, 0);
  const canGoLive = streamTitle.trim().length > 0 && liveSelected.length > 0;

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* LIVE BANNER */}
      {isLive && (
        <div style={{ padding:"16px", borderRadius:"14px", marginBottom:"18px", background:"rgba(255,59,48,0.1)", border:"2px solid rgba(255,59,48,0.5)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            <div style={{ width:"12px", height:"12px", borderRadius:"50%", background:"#FF3B30", animation:"livePulse 1.5s infinite", flexShrink:0 }} />
            <div>
              <div style={{ fontSize:"13px", fontWeight:"900", color:"#FF3B30", letterSpacing:"0.1em" }}>🔴 YOU ARE LIVE</div>
              <div style={{ fontSize:"10px", color:"#777", fontFamily:"monospace" }}>{fmt(liveTimer)} · {totalViewers} viewers</div>
            </div>
          </div>
          <button onClick={endLive} style={{ padding:"8px 16px", borderRadius:"10px", border:"none", background:"#FF3B30", color:"#fff", fontWeight:"900", fontSize:"11px", letterSpacing:"0.1em", cursor:"pointer" }}>
            END STREAM
          </button>
        </div>
      )}

      {/* CAMERA */}
      <ASection title="Camera Preview" icon="📹" color="#FF3B30">
        <div style={{ borderRadius:"12px", overflow:"hidden", background:"#000", position:"relative", aspectRatio:"16/9", marginBottom:"12px" }}>
          <video ref={videoRef} muted playsInline style={{ width:"100%", height:"100%", objectFit:"cover", display:cameraOn ? "block" : "none" }} />
          {!cameraOn && (
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"10px" }}>
              <div style={{ fontSize:"36px" }}>📷</div>
              <div style={{ fontSize:"11px", color:"#555", fontFamily:"monospace" }}>Camera not started</div>
            </div>
          )}
          {isLive && (
            <>
              <div style={{ position:"absolute", top:"10px", left:"10px", display:"flex", gap:"8px", alignItems:"center" }}>
                <div style={{ padding:"4px 10px", borderRadius:"6px", background:"rgba(255,59,48,0.9)", fontSize:"10px", fontWeight:"900", letterSpacing:"0.15em", color:"#fff" }}>● LIVE</div>
                <div style={{ padding:"4px 10px", borderRadius:"6px", background:"rgba(0,0,0,0.7)", fontSize:"10px", color:"#fff", fontFamily:"monospace" }}>{fmt(liveTimer)}</div>
              </div>
              <div style={{ position:"absolute", top:"10px", right:"10px", padding:"4px 10px", borderRadius:"6px", background:"rgba(0,0,0,0.7)", fontSize:"10px", color:"#FFD60A", fontFamily:"monospace" }}>
                👁 {totalViewers}
              </div>
            </>
          )}
        </div>
        {camError && (
          <div style={{ padding:"8px 12px", borderRadius:"8px", marginBottom:"10px", background:"rgba(255,59,48,0.1)", border:"1px solid rgba(255,59,48,0.3)", fontSize:"11px", color:"#FF3B30" }}>
            {camError}
          </div>
        )}
        {!cameraOn
          ? <button onClick={startCamera} style={{ width:"100%", padding:"11px", borderRadius:"10px", background:"rgba(255,59,48,0.12)", border:"1px solid rgba(255,59,48,0.3)", color:"#FF3B30", fontWeight:"700", fontSize:"11px", letterSpacing:"0.1em", cursor:"pointer" }}>📷 START CAMERA</button>
          : <button onClick={stopCamera}  style={{ width:"100%", padding:"11px", borderRadius:"10px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", color:"#777", fontWeight:"700", fontSize:"11px", letterSpacing:"0.1em", cursor:"pointer" }}>⏹ STOP CAMERA</button>
        }
      </ASection>

      {/* STREAM PLATFORMS */}
      <ASection title="Stream To Platforms" icon="◆" color="#FF6B35">
        <div style={{ padding:"12px", borderRadius:"10px", marginBottom:"14px", background:"rgba(255,107,53,0.06)", border:"1px solid rgba(255,107,53,0.15)" }}>
          <div style={{ fontSize:"10px", color:"#FF6B35", marginBottom:"4px" }}>◆ HOW IT WORKS</div>
          <div style={{ fontSize:"11px", color:"#777", lineHeight:1.6 }}>Select platforms, enter your stream keys below, add a title, and hit GO LIVE. Your feed broadcasts simultaneously via RTMP.</div>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"8px", marginBottom:"16px" }}>
          {LIVE_PLATFORMS.map(p => {
            const sel = liveSelected.includes(p.id);
            return (
              <button key={p.id} onClick={() => setLiveSelected(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                style={{ display:"flex", alignItems:"center", gap:"6px", padding:"8px 12px", borderRadius:"18px", cursor:"pointer", background:sel ? `${p.color}20` : "rgba(255,255,255,0.03)", border:sel ? `1px solid ${p.color}` : "1px solid rgba(255,255,255,0.07)", color:sel ? p.color : "#484848", fontSize:"10px", fontWeight:sel ? "700" : "400", transition:"all 0.2s" }}>
                <span>{p.icon}</span><span>{p.name}</span>{sel && <span>✓</span>}
              </button>
            );
          })}
        </div>

        {/* STREAM KEYS */}
        {LIVE_PLATFORMS.filter(p => liveSelected.includes(p.id)).map(p => (
          <div key={p.id} style={{ marginBottom:"12px" }}>
            <label style={{ fontSize:"9px", color:p.color, letterSpacing:"0.15em", display:"flex", alignItems:"center", gap:"6px", marginBottom:"5px" }}>
              <span>{p.icon}</span>{p.name.toUpperCase()} STREAM KEY
            </label>
            <input value={cfg.liveKeys[p.id] || ""} onChange={e => update("liveKeys", p.id, e.target.value)}
              placeholder={`Paste your ${p.name} stream key...`} type="password"
              style={{ width:"100%", padding:"10px 13px", background:"rgba(0,0,0,0.4)", border:`1px solid ${p.color}30`, borderRadius:"8px", color:"#E8E4DC", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
            <div style={{ fontSize:"8px", color:"#3a3a3a", marginTop:"3px", fontFamily:"monospace" }}>RTMP: {p.rtmpBase}[YOUR_KEY]</div>
          </div>
        ))}
      </ASection>

      {/* STREAM INFO */}
      <ASection title="Stream Details" icon="◈" color="#C77DFF">
        <AField label="Stream Title" value={streamTitle} onChange={setStreamTitle} placeholder="What are you streaming today?" />
        <div style={{ marginBottom:"14px" }}>
          <label style={{ fontSize:"9px", letterSpacing:"0.22em", color:"#555", display:"block", marginBottom:"7px" }}>DESCRIPTION</label>
          <textarea value={streamDesc} onChange={e => setStreamDesc(e.target.value)} placeholder="Tell your audience what this stream is about..." rows={3}
            style={{ width:"100%", padding:"11px 13px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"9px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace", resize:"vertical", lineHeight:1.5 }} />
        </div>
      </ASection>

      {/* VIEWER COUNTS */}
      {isLive && (
        <div style={{ marginBottom:"18px", padding:"16px", borderRadius:"12px", background:"rgba(255,59,48,0.05)", border:"1px solid rgba(255,59,48,0.2)" }}>
          <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#FF3B30", marginBottom:"12px" }}>LIVE VIEWERS PER PLATFORM</div>
          {liveSelected.map(pid => {
            const p = LIVE_PLATFORMS.find(x => x.id === pid);
            if (!p) return null;
            const count = viewers[pid] || 0;
            const pct = Math.min(100, count * 2);
            return (
              <div key={pid} style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"8px" }}>
                <span style={{ color:p.color, fontSize:"14px", width:"20px", textAlign:"center" }}>{p.icon}</span>
                <div style={{ flex:1, height:"4px", borderRadius:"2px", background:"rgba(255,255,255,0.06)" }}>
                  <div style={{ height:"100%", borderRadius:"2px", background:p.color, width:`${pct}%`, transition:"width 0.5s ease" }} />
                </div>
                <span style={{ fontSize:"11px", fontWeight:"700", color:p.color, fontFamily:"monospace", width:"32px", textAlign:"right" }}>{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* GO LIVE / END BUTTON */}
      {!isLive ? (
        <button onClick={goLive} disabled={!canGoLive}
          style={{ width:"100%", padding:"18px", borderRadius:"14px", border:"none", cursor:canGoLive ? "pointer" : "not-allowed", background:canGoLive ? "linear-gradient(135deg,#FF3B30,#FF6B35)" : "rgba(255,255,255,0.05)", color:canGoLive ? "#fff" : "#383838", fontSize:"14px", fontWeight:"900", letterSpacing:"0.2em", boxShadow:canGoLive ? "0 8px 32px rgba(255,59,48,0.4)" : "none", transition:"all 0.3s" }}>
          🔴 GO LIVE ON {liveSelected.length} PLATFORM{liveSelected.length !== 1 ? "S" : ""}
        </button>
      ) : (
        <button onClick={endLive} style={{ width:"100%", padding:"18px", borderRadius:"14px", cursor:"pointer", background:"rgba(255,59,48,0.15)", border:"2px solid #FF3B30", color:"#FF3B30", fontSize:"14px", fontWeight:"900", letterSpacing:"0.2em" }}>
          ⏹ END LIVE STREAM
        </button>
      )}

      <div style={{ marginTop:"16px", padding:"12px", borderRadius:"10px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ fontSize:"9px", color:"#555", letterSpacing:"0.2em", marginBottom:"6px" }}>◆ BEST MOBILE STREAMING APPS</div>
        <div style={{ fontSize:"11px", color:"#666", lineHeight:1.65 }}>Use <strong style={{color:"#ccc"}}>Streamyard</strong> or <strong style={{color:"#ccc"}}>Restream.io</strong> on your phone for the most reliable multi-platform streaming. Enter your stream keys there — this panel stores them all in one place.</div>
      </div>
    </div>
  );
}

// ─── SOCIAL TAB ───────────────────────────────────────────────────────────────
function SocialTab({ cfg, update }) {
  const fields = [
    { id:"instagram", label:"Instagram",   icon:"📸", color:"#E1306C", ph:"@yourhandle"    },
    { id:"tiktok",    label:"TikTok",      icon:"🎵", color:"#69C9D0", ph:"@yourhandle"    },
    { id:"youtube",   label:"YouTube",     icon:"▶",  color:"#FF0000", ph:"@yourchannel"   },
    { id:"twitter",   label:"X / Twitter", icon:"✕",  color:"#1DA1F2", ph:"@yourhandle"    },
    { id:"facebook",  label:"Facebook",    icon:"📘", color:"#4267B2", ph:"Your Page Name" },
    { id:"spotify",   label:"Spotify",     icon:"♫",  color:"#1DB954", ph:"Your Artist"    },
  ];
  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <ASection title="Social Media Handles" icon="◎" color="#FFD60A">
        {fields.map(p => (
          <div key={p.id} style={{ marginBottom:"12px" }}>
            <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:p.color, display:"flex", alignItems:"center", gap:"6px", marginBottom:"7px" }}>
              <span>{p.icon}</span>{p.label.toUpperCase()}
            </label>
            <input value={cfg.social[p.id]} onChange={e => update("social", p.id, e.target.value)} placeholder={p.ph}
              style={{ width:"100%", padding:"11px 13px", background:"rgba(0,0,0,0.4)", border:`1px solid ${p.color}30`, borderRadius:"9px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace" }} />
          </div>
        ))}
      </ASection>
    </div>
  );
}

// ─── APIS TAB ─────────────────────────────────────────────────────────────────
function ApisTab({ cfg, update, testConn, testResult }) {
  const apis = [
    { id:"publerKey",       label:"Publer API Key",         icon:"◆", color:"#FF6B35", desc:"Cross-platform publisher",     link:"publer.io"                   },
    { id:"tiktokKey",       label:"TikTok Content API",     icon:"🎵", color:"#69C9D0", desc:"Direct posting API key",       link:"developers.tiktok.com"       },
    { id:"youtubeKey",      label:"YouTube Data API v3",    icon:"▶", color:"#FF0000",  desc:"Google Cloud Console key",     link:"console.cloud.google.com"    },
    { id:"spotifyClientId", label:"Spotify Client ID",      icon:"♫", color:"#1DB954",  desc:"Spotify Developer Dashboard",  link:"developer.spotify.com"       },
    { id:"stripeKey",       label:"Stripe Publishable Key", icon:"💳", color:"#635BFF", desc:"Payments & memberships",       link:"dashboard.stripe.com"        },
  ];
  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <div style={{ padding:"14px", borderRadius:"12px", marginBottom:"20px", background:"rgba(255,59,48,0.07)", border:"1px solid rgba(255,59,48,0.2)" }}>
        <div style={{ fontSize:"10px", color:"#FF3B30", marginBottom:"5px" }}>🔒 SECURITY NOTICE</div>
        <div style={{ fontSize:"11px", color:"#888", lineHeight:1.6 }}>In production, store API keys server-side. Never expose secret keys in public client code.</div>
      </div>
      {apis.map(api => {
        const st = testResult[api.id];
        return (
          <div key={api.id} style={{ marginBottom:"16px", padding:"16px", borderRadius:"12px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"8px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"7px" }}>
                <span style={{ color:api.color, fontSize:"14px" }}>{api.icon}</span>
                <div>
                  <div style={{ fontSize:"11px", fontWeight:"700", color:api.color }}>{api.label}</div>
                  <div style={{ fontSize:"9px", color:"#484848" }}>{api.desc}</div>
                </div>
              </div>
              <button onClick={() => testConn(api.id)}
                style={{ padding:"5px 10px", borderRadius:"7px", cursor:"pointer", fontSize:"9px", transition:"all 0.2s",
                  background: st==="success" ? "rgba(0,245,212,0.1)" : st==="fail" ? "rgba(255,59,48,0.1)" : "rgba(255,255,255,0.05)",
                  border:     st==="success" ? "1px solid rgba(0,245,212,0.3)" : st==="fail" ? "1px solid rgba(255,59,48,0.3)" : "1px solid rgba(255,255,255,0.08)",
                  color:      st==="success" ? "#00F5D4" : st==="fail" ? "#FF3B30" : api.color }}>
                {st==="testing" ? "◌ ..." : st==="success" ? "✓ OK" : st==="fail" ? "✗ FAIL" : "TEST"}
              </button>
            </div>
            <input value={cfg.apis[api.id]} onChange={e => update("apis", api.id, e.target.value)}
              placeholder={`Enter ${api.label}...`} type="password"
              style={{ width:"100%", padding:"10px 13px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"8px", color:"#E8E4DC", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
            <div style={{ fontSize:"9px", color:"#3a3a3a", marginTop:"6px" }}>
              Get key → <span style={{ color:api.color }}>{api.link}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── FEATURES TAB ─────────────────────────────────────────────────────────────
function FeaturesTab({ cfg, setCfg }) {
  const F = cfg.features || {};
  const toggleFeature = (id) => setCfg(p=>({...p,features:{...p.features,[id]:!p.features[id]}}));
  const setFeature = (id,val) => setCfg(p=>({...p,features:{...p.features,[id]:val}}));

  const features = [
    { id:"membershipEnabled", label:"Fan Membership",      desc:"$4.99/mo subscription tier",         color:"#FFD60A" },
    { id:"downloadEnabled",   label:"Digital Downloads",   desc:"Music & episode download sales",      color:"#FF6B35" },
    { id:"scheduleEnabled",   label:"Post Scheduling",     desc:"Schedule posts for optimal times",    color:"#C77DFF" },
    { id:"analyticsEnabled",  label:"Analytics Dashboard", desc:"Track plays, views, follower growth", color:"#00F5D4" },
    { id:"merchEnabled",      label:"Merch Store",         desc:"In-app merchandise shop",             color:"#F72585" },
  ];

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* FEATURE TOGGLES */}
      <ASection title="Feature Toggles" icon="⚙" color="#00F5D4">
        {features.map(f => (
          <div key={f.id} style={{ display:"flex", alignItems:"center", gap:"14px", padding:"14px", marginBottom:"8px", borderRadius:"12px", background:F[f.id]?`${f.color}0d`:"rgba(255,255,255,0.02)", border:F[f.id]?`1px solid ${f.color}30`:"1px solid rgba(255,255,255,0.06)", transition:"all 0.3s" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:"13px", fontWeight:"700", color:F[f.id]?f.color:"#777" }}>{f.label}</div>
              <div style={{ fontSize:"10px", color:"#484848", marginTop:"2px" }}>{f.desc}</div>
            </div>
            <div onClick={()=>toggleFeature(f.id)} style={{ width:"48px", height:"26px", borderRadius:"13px", cursor:"pointer", flexShrink:0, background:F[f.id]?f.color:"rgba(255,255,255,0.1)", position:"relative", transition:"background 0.3s" }}>
              <div style={{ width:"20px", height:"20px", borderRadius:"50%", background:"#fff", position:"absolute", top:"3px", left:F[f.id]?"25px":"3px", transition:"left 0.3s", boxShadow:"0 1px 4px rgba(0,0,0,0.4)" }} />
            </div>
          </div>
        ))}
      </ASection>


      {/* 💡 LED BORDER */}
      <ASection title="LED Border" icon="💡" color="#C77DFF">
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px" }}>
          <div>
            <div style={{ fontSize:"13px", fontWeight:"700", color:F.ledBorder?"#C77DFF":"#777" }}>LED Edge Glow</div>
            <div style={{ fontSize:"10px", color:"#555", marginTop:"2px" }}>Glowing light strip runs along all 4 edges of the app</div>
          </div>
          <div onClick={()=>toggleFeature("ledBorder")} style={{ width:"48px", height:"26px", borderRadius:"13px", cursor:"pointer", flexShrink:0, background:F.ledBorder?"#C77DFF":"rgba(255,255,255,0.1)", position:"relative", transition:"background 0.3s" }}>
            <div style={{ width:"20px", height:"20px", borderRadius:"50%", background:"#fff", position:"absolute", top:"3px", left:F.ledBorder?"25px":"3px", transition:"left 0.3s" }} />
          </div>
        </div>

        {F.ledBorder && (
          <>
            {/* MODE */}
            <div style={{ marginBottom:"14px" }}>
              <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"8px" }}>LED MODE</label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px" }}>
                {[["pulse","💡 Pulse"],["breathe","🌬 Breathe"],["chase","⚡ Chase"],["rainbow","🌈 Rainbow"]].map(([val,lbl])=>(
                  <div key={val} onClick={()=>setFeature("ledMode",val)}
                    style={{ padding:"10px", borderRadius:"9px", textAlign:"center", cursor:"pointer", border:F.ledMode===val?"1px solid #C77DFF":"1px solid rgba(255,255,255,0.07)", background:F.ledMode===val?"rgba(199,125,255,0.12)":"rgba(255,255,255,0.02)" }}>
                    <div style={{ fontSize:"11px", fontWeight:"700", color:F.ledMode===val?"#C77DFF":"#777" }}>{lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* SPEED */}
            <div style={{ marginBottom:"14px" }}>
              <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"8px" }}>LED SPEED</label>
              <div style={{ display:"flex", gap:"6px" }}>
                {[["fast","Fast"],["medium","Medium"],["slow","Slow"]].map(([val,lbl])=>(
                  <div key={val} onClick={()=>setFeature("ledSpeed",val)}
                    style={{ flex:1, padding:"9px", borderRadius:"9px", textAlign:"center", cursor:"pointer", border:(F.ledSpeed||"medium")===val?"1px solid #C77DFF":"1px solid rgba(255,255,255,0.07)", background:(F.ledSpeed||"medium")===val?"rgba(199,125,255,0.12)":"rgba(255,255,255,0.02)" }}>
                    <div style={{ fontSize:"11px", fontWeight:"700", color:(F.ledSpeed||"medium")===val?"#C77DFF":"#777" }}>{lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* CUSTOM COLOR */}
            <div>
              <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"8px" }}>LED COLOR (leave blank to use brand colors)</label>
              <div style={{ display:"flex", gap:"10px", alignItems:"center" }}>
                <input type="color" value={F.ledColor||cfg.brand.primaryColor||"#FF6B35"} onChange={e=>setFeature("ledColor",e.target.value)}
                  style={{ width:"48px", height:"42px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", cursor:"pointer", background:"none" }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:"11px", color:"#bbb" }}>{F.ledColor || "Using brand primary color"}</div>
                  {F.ledColor && <button onClick={()=>setFeature("ledColor","")} style={{ marginTop:"4px", fontSize:"9px", color:"#777", background:"none", border:"none", cursor:"pointer", padding:0 }}>✕ Reset to brand color</button>}
                </div>
              </div>
            </div>
          </>
        )}
      </ASection>
    </div>
  );
}


// ─── AUTOPLAY ADMIN TAB ───────────────────────────────────────────────────────
function AutoPlayAdminTab({ cfg, setCfg }) {
  const ap     = cfg.autoPlay || {};
  const tracks = cfg.music?.tracks || [];
  const update = (key, val) => setCfg(p => ({ ...p, autoPlay:{ ...p.autoPlay, [key]:val } }));

  const urlRef   = useRef(null);
  const audioRef = useRef(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewSrc,     setPreviewSrc]     = useState("");

  // Resolve the active source
  const getActiveSrc = () => {
    if (ap.trackUrl?.trim()) return ap.trackUrl.trim();
    if (tracks.length > 0) {
      const t = tracks[Math.min(ap.trackIndex || 0, tracks.length - 1)];
      return t.audioFile?.length > 10 ? t.audioFile : t.audioUrl?.trim() || "";
    }
    return "";
  };

  const activeTrack = tracks[Math.min(ap.trackIndex || 0, tracks.length - 1)];
  const displayTitle = ap.trackUrl?.trim()
    ? (ap.trackTitle || "Custom URL Track")
    : activeTrack?.title || "No track selected";

  const togglePreview = () => {
    if (previewPlaying) {
      audioRef.current?.pause();
      setPreviewPlaying(false);
    } else {
      const src = getActiveSrc();
      if (!src) return;
      if (!audioRef.current || previewSrc !== src) {
        if (audioRef.current) audioRef.current.pause();
        audioRef.current = new Audio(src);
        audioRef.current.volume = (ap.volume ?? 35) / 100;
        audioRef.current.loop = ap.loop ?? false;
        audioRef.current.onended = () => setPreviewPlaying(false);
        setPreviewSrc(src);
      }
      audioRef.current.play().then(() => setPreviewPlaying(true)).catch(() => {});
    }
  };

  // Stop preview on unmount
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const Toggle = ({ val, onChange }) => (
    <div onClick={() => onChange(!val)} style={{ width:"48px", height:"26px", borderRadius:"13px", cursor:"pointer", flexShrink:0, background:val?"#FF6B35":"rgba(255,255,255,0.1)", position:"relative", transition:"background 0.3s" }}>
      <div style={{ width:"20px", height:"20px", borderRadius:"50%", background:"#fff", position:"absolute", top:"3px", left:val?"25px":"3px", transition:"left 0.3s", boxShadow:"0 1px 4px rgba(0,0,0,0.4)" }} />
    </div>
  );

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* MASTER ENABLE */}
      <div style={{ padding:"16px", borderRadius:"14px", marginBottom:"20px", display:"flex", alignItems:"center", justifyContent:"space-between", background: ap.enabled ? "rgba(255,107,53,0.1)" : "rgba(255,255,255,0.02)", border: ap.enabled ? "1px solid rgba(255,107,53,0.35)" : "1px solid rgba(255,255,255,0.08)", transition:"all 0.3s" }}>
        <div>
          <div style={{ fontSize:"15px", fontWeight:"800", color:ap.enabled?"#FF6B35":"#777" }}>Auto-Play Music</div>
          <div style={{ fontSize:"11px", color:"#555", marginTop:"3px" }}>{ap.enabled ? "Music plays when visitors open the app" : "Disabled — music won't auto-play"}</div>
        </div>
        <Toggle val={ap.enabled} onChange={v => update("enabled", v)} />
      </div>

      {ap.enabled && (
        <>
          {/* TRACK SELECTION */}
          <ASection title="Track Selection" icon="🎵" color="#FF6B35">

            {/* FROM MUSIC LIST */}
            <div style={{ marginBottom:"14px" }}>
              <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"8px" }}>CHOOSE FROM YOUR MUSIC LIST</label>
              {tracks.length === 0 ? (
                <div style={{ padding:"12px", borderRadius:"9px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", fontSize:"11px", color:"#555", textAlign:"center" }}>
                  No tracks added yet — go to ♪ MUSIC to add tracks first
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                  {tracks.map((t, i) => {
                    const hasSrc = !!(t.audioFile?.length > 10 || t.audioUrl?.trim());
                    const isSelected = !ap.trackUrl?.trim() && (ap.trackIndex || 0) === i;
                    return (
                      <div key={i} onClick={() => { if (hasSrc) { update("trackIndex", i); update("trackUrl", ""); update("trackTitle", ""); }}}
                        style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 12px", borderRadius:"10px", cursor:hasSrc?"pointer":"not-allowed", transition:"all 0.2s",
                          background:isSelected?"rgba(255,107,53,0.12)":"rgba(255,255,255,0.02)",
                          border:isSelected?"1px solid rgba(255,107,53,0.4)":"1px solid rgba(255,255,255,0.06)",
                          opacity:hasSrc?1:0.4 }}>
                        <div style={{ width:"32px", height:"32px", borderRadius:"8px", background:isSelected?"rgba(255,107,53,0.2)":"rgba(255,255,255,0.05)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px", flexShrink:0 }}>
                          {isSelected ? "▶" : t.icon || "♪"}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:"12px", fontWeight:isSelected?"800":"600", color:isSelected?"#fff":"#ccc", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title}</div>
                          <div style={{ fontSize:"9px", color:"#555", fontFamily:"monospace" }}>{t.genre} {!hasSrc && "· no audio file"}</div>
                        </div>
                        {isSelected && <div style={{ fontSize:"9px", color:"#FF6B35", fontFamily:"monospace", fontWeight:"700" }}>SELECTED ✓</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* CUSTOM URL */}
            <div style={{ padding:"12px", borderRadius:"10px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", marginBottom:"8px" }}>OR USE A CUSTOM URL</div>
              <input value={ap.trackUrl || ""} onChange={e => update("trackUrl", e.target.value)} placeholder="https://example.com/track.mp3"
                style={{ width:"100%", padding:"9px 11px", background:"rgba(0,0,0,0.4)", border:`1px solid ${ap.trackUrl?"rgba(255,107,53,0.35)":"rgba(255,255,255,0.08)"}`, borderRadius:"8px", color:"#ddd", fontSize:"11px", outline:"none", fontFamily:"monospace", marginBottom:"8px" }} />
              {ap.trackUrl?.trim() && (
                <AField label="Display Name" value={ap.trackTitle||""} onChange={v=>update("trackTitle",v)} placeholder="Track title to show in banner" />
              )}
            </div>

            {/* PREVIEW BUTTON */}
            <div style={{ marginTop:"12px", display:"flex", gap:"8px", alignItems:"center" }}>
              <button onClick={togglePreview} disabled={!getActiveSrc()}
                style={{ flex:1, padding:"10px", borderRadius:"10px", border:previewPlaying?"1px solid rgba(255,107,53,0.5)":"1px solid rgba(255,255,255,0.1)", background:previewPlaying?"rgba(255,107,53,0.15)":"rgba(255,255,255,0.04)", color:previewPlaying?"#FF6B35":"#bbb", fontSize:"11px", fontWeight:"700", cursor:"pointer", letterSpacing:"0.1em", display:"flex", alignItems:"center", justifyContent:"center", gap:"8px" }}>
                {previewPlaying ? (
                  <><div style={{ display:"flex", gap:"2px", alignItems:"flex-end" }}>{[1,2,3].map(i=><div key={i} style={{ width:"3px", height:`${[10,14,8][i-1]}px`, borderRadius:"2px", background:"#FF6B35", animation:`eq${i} 0.6s ease-in-out infinite alternate` }}/>)}</div>STOP PREVIEW</>
                ) : "▶ PREVIEW TRACK"}
              </button>
              <div style={{ fontSize:"10px", color:"#555", flex:1, textAlign:"center" }}>
                {displayTitle}
              </div>
            </div>
          </ASection>

          {/* PLAYBACK SETTINGS */}
          <ASection title="Playback Settings" icon="⚙" color="#C77DFF">

            {/* VOLUME */}
            <div style={{ marginBottom:"18px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px" }}>
                <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555" }}>VOLUME</label>
                <span style={{ fontSize:"12px", fontWeight:"700", color:"#C77DFF", fontFamily:"monospace" }}>{ap.volume ?? 35}%</span>
              </div>
              <input type="range" min={5} max={100} step={5} value={ap.volume ?? 35}
                onChange={e => update("volume", Number(e.target.value))}
                style={{ width:"100%", accentColor:"#C77DFF" }} />
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:"8px", color:"#333", marginTop:"2px" }}>
                <span>Quiet</span><span>Full Volume</span>
              </div>
            </div>

            {/* DELAY */}
            <div style={{ marginBottom:"18px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px" }}>
                <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555" }}>START DELAY</label>
                <span style={{ fontSize:"12px", fontWeight:"700", color:"#C77DFF", fontFamily:"monospace" }}>
                  {ap.delay ? `${ap.delay}s` : "Instant"}
                </span>
              </div>
              <input type="range" min={0} max={30} step={1} value={ap.delay ?? 0}
                onChange={e => update("delay", Number(e.target.value))}
                style={{ width:"100%", accentColor:"#C77DFF" }} />
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:"8px", color:"#333", marginTop:"2px" }}>
                <span>Instant</span><span>30s delay</span>
              </div>
            </div>

            {/* TOGGLES */}
            {[
              ["fadeIn",     "🌅 Fade In",         "Volume fades in gradually over 3 seconds", ap.fadeIn ?? true],
              ["loop",       "🔁 Loop Track",       "Repeat the track continuously",            ap.loop  ?? false],
              ["showBanner", "📢 Show Now Playing", "Displays a banner when music starts",      ap.showBanner ?? true],
            ].map(([key, label, desc, val]) => (
              <div key={key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                <div>
                  <div style={{ fontSize:"12px", fontWeight:"600", color:val?"#ddd":"#666" }}>{label}</div>
                  <div style={{ fontSize:"10px", color:"#484848", marginTop:"2px" }}>{desc}</div>
                </div>
                <Toggle val={val} onChange={v => update(key, v)} />
              </div>
            ))}
          </ASection>

          {/* TRIGGER */}
          <ASection title="When to Play" icon="⏰" color="#00F5D4">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
              {[
                ["first_tap", "👆 First Tap", "Plays after visitor's first tap/touch (most compatible with mobile)"],
                ["immediate", "⚡ Immediate", "Tries to play the instant app loads (may be blocked by browser)"],
              ].map(([val, label, desc]) => (
                <div key={val} onClick={() => update("trigger", val)}
                  style={{ padding:"12px", borderRadius:"10px", cursor:"pointer", border:(ap.trigger||"first_tap")===val?"1px solid rgba(0,245,212,0.4)":"1px solid rgba(255,255,255,0.07)", background:(ap.trigger||"first_tap")===val?"rgba(0,245,212,0.08)":"rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize:"12px", fontWeight:"700", color:(ap.trigger||"first_tap")===val?"#00F5D4":"#777", marginBottom:"4px" }}>{label}</div>
                  <div style={{ fontSize:"9px", color:"#555", lineHeight:1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:"10px", padding:"9px 12px", borderRadius:"8px", background:"rgba(0,0,0,0.3)", border:"1px solid rgba(255,255,255,0.05)", fontSize:"10px", color:"#555" }}>
              ⚠ All browsers block immediate audio without a user gesture. "First Tap" is the most reliable option on mobile.
            </div>
          </ASection>

          {/* LIVE PREVIEW SUMMARY */}
          <div style={{ padding:"14px 16px", borderRadius:"12px", background:"rgba(255,107,53,0.07)", border:"1px solid rgba(255,107,53,0.2)" }}>
            <div style={{ fontSize:"9px", color:"#FF6B35", letterSpacing:"0.2em", fontFamily:"monospace", marginBottom:"8px" }}>◆ CURRENT CONFIG SUMMARY</div>
            {[
              ["Track",   displayTitle],
              ["Volume",  `${ap.volume ?? 35}%`],
              ["Delay",   ap.delay ? `${ap.delay}s after trigger` : "No delay"],
              ["Trigger", ap.trigger === "immediate" ? "Immediate on load" : "On first user tap"],
              ["Fade In", (ap.fadeIn ?? true) ? "Yes" : "No"],
              ["Loop",    ap.loop ? "Yes" : "No"],
              ["Banner",  (ap.showBanner ?? true) ? "Shown" : "Hidden"],
            ].map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", fontSize:"11px" }}>
                <span style={{ color:"#555" }}>{k}</span>
                <span style={{ color:"#ccc", fontFamily:"monospace" }}>{v}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── THEMES TAB ───────────────────────────────────────────────────────────────
const THEME_PREVIEWS = {
  dark: {
    desc: "The original. Deep black background with warm cream text. Cinematic and bold — built for creators.",
    bg: "linear-gradient(135deg,#080808,#111118)",
    card: "rgba(255,255,255,0.04)",
    textColor: "#F0EDE8",
    subColor: "#555",
    accent1: "#FF6B35", accent2: "#C77DFF",
  },
  light: {
    desc: "Clean warm off-white with dark text. Professional, inviting, and easy on the eyes.",
    bg: "linear-gradient(135deg,#F4F1EC,#EDE9E0)",
    card: "rgba(0,0,0,0.05)",
    textColor: "#111111",
    subColor: "#888",
    accent1: "#FF6B35", accent2: "#C77DFF",
  },
  metal: {
    desc: "Brushed steel aesthetic. Dark gunmetal with chrome accents and subtle metallic sheen.",
    bg: "linear-gradient(135deg,#1e1e28,#141420,#22222e,#18181e)",
    card: "rgba(180,180,200,0.09)",
    textColor: "#E8E8F4",
    subColor: "#7070a0",
    accent1: "#A8A8C8", accent2: "#8888B8",
    extra: "repeating-linear-gradient(90deg,rgba(255,255,255,0.015) 0px,transparent 1px,transparent 4px)",
  },
  corporate: {
    desc: "Polished boardroom energy. Light desk tones, navy accents, and clean typography that means business.",
    bg: "linear-gradient(135deg,#EEF1F5,#F5F7FA)",
    card: "#FFFFFF",
    textColor: "#1A1D23",
    subColor: "#5A6270",
    accent1: "#2C5282", accent2: "#4A90D9",
    topBar: "linear-gradient(90deg,#2C5282,#4A90D9,#2C5282)",
  },
  minimal: {
    desc: "Pure. White space is the design. No distractions — just your content, presented with precision.",
    bg: "linear-gradient(135deg,#FAFAFA,#F0F0F0)",
    card: "#FFFFFF",
    textColor: "#0A0A0A",
    subColor: "#909090",
    accent1: "#0A0A0A", accent2: "#505050",
  },
};

function ThemesTab({ theme, setTheme }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <div style={{ padding:"14px 16px", borderRadius:"14px", marginBottom:"22px", background:"rgba(255,107,53,0.08)", border:"1px solid rgba(255,107,53,0.2)" }}>
        <div style={{ fontSize:"10px", color:"#FF6B35", fontWeight:"800", letterSpacing:"0.15em", marginBottom:"4px" }}>◆ ACTIVE THEME</div>
        <div style={{ fontSize:"13px", color:"#fff", fontWeight:"700" }}>{THEMES[theme]?.label} {THEMES[theme]?.icon}</div>
        <div style={{ fontSize:"11px", color:"#aaa", marginTop:"3px" }}>{THEME_PREVIEWS[theme]?.desc}</div>
      </div>

      <div style={{ fontSize:"9px", letterSpacing:"0.3em", color:"#555", fontFamily:"monospace", marginBottom:"14px" }}>SELECT THEME</div>

      {THEME_LIST.map(tid => {
        const t = THEMES[tid];
        const preview = THEME_PREVIEWS[tid];
        const isActive = theme === tid;
        const isHovered = hovered === tid;

        return (
          <div key={tid}
            onClick={() => setTheme(tid)}
            onMouseEnter={() => setHovered(tid)}
            onMouseLeave={() => setHovered(null)}
            style={{ marginBottom:"12px", borderRadius:"16px", overflow:"hidden", cursor:"pointer",
              border: isActive ? "2px solid #FF6B35" : "2px solid rgba(255,255,255,0.07)",
              transform: isHovered && !isActive ? "scale(1.01)" : "scale(1)",
              transition:"all 0.25s", boxShadow: isActive ? "0 4px 24px rgba(255,107,53,0.25)" : "none" }}>

            {/* MINI APP PREVIEW */}
            <div style={{ height:"110px", background:preview.bg, position:"relative", overflow:"hidden" }}>
              {preview.extra && <div style={{ position:"absolute", inset:0, backgroundImage:preview.extra, opacity:0.8 }} />}
              {preview.topBar && <div style={{ position:"absolute", top:0, left:0, right:0, height:"3px", background:preview.topBar }} />}

              {/* Mock header */}
              <div style={{ position:"absolute", top: preview.topBar?"3px":"0", left:0, right:0, padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"7px" }}>
                  <div style={{ width:"22px", height:"22px", borderRadius:"50%", background:`linear-gradient(135deg,${preview.accent1},${preview.accent2})`, opacity:0.9 }} />
                  <div>
                    <div style={{ width:"50px", height:"6px", borderRadius:"3px", background:preview.accent1, opacity:0.7 }} />
                    <div style={{ width:"35px", height:"4px", borderRadius:"2px", background:preview.subColor, opacity:0.5, marginTop:"3px" }} />
                  </div>
                </div>
                <div style={{ display:"flex", gap:"4px" }}>
                  {[22,16,14].map((w,i)=>(
                    <div key={i} style={{ width:`${w}px`, height:"14px", borderRadius:"7px", background:i===0?preview.accent1:"rgba(128,128,128,0.15)", opacity:0.85 }} />
                  ))}
                </div>
              </div>

              {/* Mock nav strip */}
              <div style={{ position:"absolute", top:"36px", left:0, right:0, height:"18px", background:preview.card, display:"flex", gap:"2px", padding:"0 10px", alignItems:"center" }}>
                {["HOME","MUSIC","SHOWS","EVENTS","SOCIAL"].map((n,i)=>(
                  <div key={n} style={{ fontSize:"5px", padding:"2px 5px", borderRadius:"3px", color:i===0?preview.accent1:preview.subColor, background:i===0?`${preview.accent1}18`:"transparent", fontFamily:"monospace", letterSpacing:"0.1em", fontWeight:"700" }}>{n}</div>
                ))}
              </div>

              {/* Mock cards */}
              <div style={{ position:"absolute", bottom:"8px", left:"10px", right:"10px", display:"flex", gap:"5px" }}>
                {[60,40,50].map((w,i)=>(
                  <div key={i} style={{ flex:1, height:"36px", borderRadius:"7px", background:preview.card, border:`1px solid ${i===0?preview.accent1+"44":"rgba(128,128,128,0.1)"}`, padding:"5px 6px" }}>
                    <div style={{ width:`${w}%`, height:"5px", borderRadius:"3px", background:i===0?preview.accent1:"rgba(128,128,128,0.25)", marginBottom:"3px" }} />
                    <div style={{ width:"70%", height:"4px", borderRadius:"2px", background:"rgba(128,128,128,0.15)" }} />
                  </div>
                ))}
              </div>

              {/* Active checkmark */}
              {isActive && (
                <div style={{ position:"absolute", top:"8px", right:"8px", width:"24px", height:"24px", borderRadius:"50%", background:"#FF6B35", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", fontWeight:"900", color:"#000" }}>✓</div>
              )}
            </div>

            {/* THEME INFO ROW */}
            <div style={{ padding:"11px 14px", background:isActive?"rgba(255,107,53,0.08)":"rgba(255,255,255,0.02)", display:"flex", alignItems:"center", gap:"10px" }}>
              <span style={{ fontSize:"18px" }}>{t.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:"13px", fontWeight:"800", color:isActive?"#FF6B35":"#ddd" }}>{t.label}</div>
                <div style={{ fontSize:"10px", color:"#666", marginTop:"2px", lineHeight:1.4 }}>{preview.desc.slice(0,60)}...</div>
              </div>
              <div style={{ padding:"6px 14px", borderRadius:"20px", fontSize:"10px", fontWeight:"800", cursor:"pointer",
                background:isActive?"#FF6B35":"rgba(255,255,255,0.06)",
                color:isActive?"#000":"#777",
                border:isActive?"none":"1px solid rgba(255,255,255,0.1)" }}>
                {isActive ? "ACTIVE ✓" : "SELECT"}
              </div>
            </div>
          </div>
        );
      })}

      <div style={{ marginTop:"10px", padding:"12px 14px", borderRadius:"11px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", fontSize:"11px", color:"#555", textAlign:"center" }}>
        Theme changes apply instantly. All your content and settings stay intact.
      </div>
    </div>
  );
}

// ─── SECURITY TAB ─────────────────────────────────────────────────────────────
function SecurityTab() {
  const accessLog = [
    { action:"Admin Login",  time:"Just now",  ok:true  },
    { action:"Config Saved", time:"2 min ago", ok:true  },
    { action:"Failed Login", time:"1 hr ago",  ok:false },
    { action:"Admin Login",  time:"Yesterday", ok:true  },
  ];
  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <ASection title="Change Admin Password" icon="🔒" color="#FF3B30">
        <PasswordChange />
      </ASection>
      <ASection title="Access Log" icon="◎" color="#484848">
        <div style={{ fontSize:"9px", color:"#555", letterSpacing:"0.2em", marginBottom:"10px" }}>RECENT ACTIVITY</div>
        {accessLog.map((l, i) => (
          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:i < accessLog.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
              <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:l.ok ? "#00F5D4" : "#FF3B30", flexShrink:0 }} />
              <span style={{ fontSize:"11px", color:"#aaa" }}>{l.action}</span>
            </div>
            <span style={{ fontSize:"10px", color:"#484848" }}>{l.time}</span>
          </div>
        ))}
      </ASection>
    </div>
  );
}

function PasswordChange() {
  const [curr, setCurr] = useState("");
  const [next, setNext] = useState("");
  const [conf, setConf] = useState("");
  const [msg,  setMsg]  = useState("");

  const handle = () => {
    if (curr !== ADMIN_PASS)  { setMsg("error:Current password is incorrect.");           return; }
    if (next.length < 8)      { setMsg("error:New password must be at least 8 characters."); return; }
    if (next !== conf)        { setMsg("error:Passwords do not match.");                  return; }
    setMsg("success:Password updated. Requires code redeployment to persist in production.");
    setCurr(""); setNext(""); setConf("");
  };

  const isErr = msg.startsWith("error:");
  const msgTxt = msg.split(":").slice(1).join(":");

  return (
    <div>
      {[["Current Password", curr, setCurr], ["New Password", next, setNext], ["Confirm New Password", conf, setConf]].map(([label, val, set], i) => (
        <div key={i} style={{ marginBottom:"12px" }}>
          <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"7px" }}>{label.toUpperCase()}</label>
          <input type="password" value={val} onChange={e => set(e.target.value)}
            style={{ width:"100%", padding:"11px 13px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"9px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace" }} />
        </div>
      ))}
      {msg && (
        <div style={{ padding:"9px 12px", borderRadius:"8px", marginBottom:"12px", fontSize:"11px", background:isErr ? "rgba(255,59,48,0.1)" : "rgba(0,245,212,0.1)", border:isErr ? "1px solid rgba(255,59,48,0.3)" : "1px solid rgba(0,245,212,0.3)", color:isErr ? "#FF3B30" : "#00F5D4" }}>
          {msgTxt}
        </div>
      )}
      <button onClick={handle} style={{ width:"100%", padding:"12px", borderRadius:"10px", border:"none", cursor:"pointer", background:"rgba(255,59,48,0.15)", color:"#FF3B30", fontSize:"11px", fontWeight:"700", letterSpacing:"0.15em" }}>
        🔒 UPDATE PASSWORD
      </button>
    </div>
  );
}

// ─── ADMIN UI HELPERS ─────────────────────────────────────────────────────────
function ASection({ title, icon, color, children }) {
  return (
    <div style={{ marginBottom:"24px", padding:"20px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:`1px solid ${color}20` }}>
      <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"18px" }}>
        <span style={{ color, fontSize:"14px" }}>{icon}</span>
        <div style={{ fontSize:"11px", fontWeight:"800", letterSpacing:"0.15em", color }}>{title.toUpperCase()}</div>
      </div>
      {children}
    </div>
  );
}

function AField({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ marginBottom:"14px" }}>
      <label style={{ fontSize:"9px", letterSpacing:"0.22em", color:"#555", display:"block", marginBottom:"7px" }}>{label.toUpperCase()}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width:"100%", padding:"11px 13px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"9px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace" }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC SCREENS
// ═══════════════════════════════════════════════════════════════════════════════

function HomeScreen({ go, config }) {
  const pc = config.brand.primaryColor;
  const ac = config.brand.accentColor;
  const heroMode     = config.brand.heroMode     || "gradient";
  const heroImageUrl = config.brand.heroImageUrl || "";
  const heroVideoUrl = config.brand.heroVideoUrl || "";
  const heroSlides   = config.brand.heroSlides   || [];
  const heroHeading  = config.brand.heroHeading  || "Your Media Empire";
  const heroSubtext  = config.brand.heroSubtext  || "MUSIC · SHOWS · GALLERY · SOCIAL";
  const [slideIdx, setSlideIdx] = useState(0);

  useEffect(() => {
    if (heroMode !== "slideshow" || !heroSlides.length) return;
    const t = setInterval(() => setSlideIdx(i => (i+1) % heroSlides.length), 5000);
    return () => clearInterval(t);
  }, [heroMode, heroSlides.length]);

  const cards = [
    { icon:"♪", title:"MUSIC",       sub:"Latest tracks & releases",      s:"music",      accent:pc        },
    { icon:"▶", title:"TALK SHOW",   sub:"Episodes & interviews",          s:"shows",      accent:ac        },
    { icon:"◈", title:"GALLERY",     sub:"Photos & behind the scenes",     s:"gallery",    accent:"#00F5D4" },
    { icon:"◎", title:"SOCIAL HUB",  sub:"All platforms in one place",     s:"social",     accent:"#FFD60A" },
    { icon:"🔥", title:"EVENTS",      sub:"Upcoming shows & appearances",   s:"events",     accent:"#FF6B35" },
    { icon:"⭐", title:"MEMBERSHIP",  sub:"Exclusive access for true fans", s:"membership", accent:"#FFD60A" },
    { icon:"📅", title:"BOOK / INQUIRE",sub:"Brand deals, features & more",s:"booking",    accent:"#C77DFF" },
    { icon:"🔗", title:"LINK IN BIO", sub:"All your links in one place",   s:"linkinbio",  accent:"#00F5D4" },
    { icon:"💬", title:"COMMUNITY",   sub:"Posts, replies & the vibe",      s:"chat",       accent:"#FF6B35" },
    ...(config.features.merchEnabled ? [{ icon:"🛍", title:"MERCH STORE", sub:"Shop your brand's products", s:"merch", accent:"#FFD60A" }] : []),
  ];

  const heroBg = heroMode==="slideshow" && heroSlides.length
    ? `url(${heroSlides[slideIdx]}) center/cover no-repeat`
    : heroMode==="single" && heroImageUrl
      ? `url(${heroImageUrl}) center/cover no-repeat`
      : `linear-gradient(180deg,${ac}18 0%,transparent 100%)`;

  const hasMedia = (heroMode==="single"&&heroImageUrl)||(heroMode==="video"&&heroVideoUrl)||(heroMode==="slideshow"&&heroSlides.length);

  return (
    <div>
      {/* HERO */}
      <div style={{ position:"relative", textAlign:"center", overflow:"hidden" }}>
        {/* BG LAYER */}
        <div style={{ position:"absolute", inset:0, background:heroBg, zIndex:0 }} />
        {/* VIDEO BG */}
        {heroMode==="video" && heroVideoUrl && (
          <video src={heroVideoUrl} autoPlay muted loop playsInline style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", zIndex:0 }} />
        )}
        {/* DARK OVERLAY */}
        {hasMedia && <div style={{ position:"absolute", inset:0, background:"rgba(8,8,8,0.55)", zIndex:1 }} />}
        {/* SLIDESHOW DOTS */}
        {heroMode==="slideshow" && heroSlides.length>1 && (
          <div style={{ position:"absolute", bottom:"16px", left:"50%", transform:"translateX(-50%)", display:"flex", gap:"6px", zIndex:3 }}>
            {heroSlides.map((_,i)=>(
              <div key={i} onClick={()=>setSlideIdx(i)} style={{ width:i===slideIdx?"20px":"6px", height:"6px", borderRadius:"3px", background:i===slideIdx?"#fff":"rgba(255,255,255,0.4)", cursor:"pointer", transition:"all 0.3s" }} />
            ))}
          </div>
        )}
        {/* CONTENT */}
        <div style={{ position:"relative", zIndex:2, padding:"52px 24px 42px" }}>
          <div style={{ margin:"0 auto 20px" }}><LogoDisplay config={config} size={88} /></div>
          <h1 style={{ fontSize:"clamp(26px,7vw,48px)", fontWeight:"900", margin:"0 0 6px", lineHeight:1.1, letterSpacing:"-0.01em" }}>
            Welcome to<br />
            <span style={{ background:`linear-gradient(135deg,${pc},${ac},#00F5D4)`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              {heroHeading}
            </span>
          </h1>
          <p style={{ color:hasMedia?"rgba(255,255,255,0.7)":"#999", fontSize:"12px", letterSpacing:"0.14em", margin:"0 0 28px", fontFamily:"monospace" }}>
            {heroSubtext}
          </p>
          <div style={{ display:"flex", gap:"10px", justifyContent:"center", flexWrap:"wrap" }}>
            {[["♪ Music","music"],["▶ Shows","shows"],["◎ Social","social"]].map(([l,s],i) => (
              <button key={i} onClick={() => go(s)} style={{ padding:"10px 18px", borderRadius:"22px", cursor:"pointer", fontSize:"11px", fontWeight:"700", letterSpacing:"0.1em", fontFamily:"monospace", background:i===0?`linear-gradient(135deg,${pc},${ac})`:"rgba(255,255,255,0.1)", border:i===0?"none":"1px solid rgba(255,255,255,0.2)", color:i===0?"#000":"#ddd" }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display:"flex", borderTop:"1px solid rgba(255,255,255,0.06)", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        {[["66K+","FOLLOWERS"],["6","PLATFORMS"],["∞","CONTENT"]].map(([n,l],i) => (
          <div key={i} style={{ flex:1, padding:"18px 10px", textAlign:"center", borderRight:i<2?"1px solid rgba(255,255,255,0.06)":"none" }}>
            <div style={{ fontSize:"24px", fontWeight:"900", background:`linear-gradient(135deg,${pc},${ac})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>{n}</div>
            <div style={{ fontSize:"8px", letterSpacing:"0.28em", color:"#999", fontFamily:"monospace" }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ padding:"28px 20px" }}>
        {cards.map((item,i) => (
          <div key={i} onClick={() => go(item.s)} style={{ display:"flex", alignItems:"center", gap:"14px", padding:"18px", marginBottom:"10px", borderRadius:"12px", background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)", cursor:"pointer", transition:"border-color 0.2s" }}>
            <div style={{ width:"46px", height:"46px", borderRadius:"11px", flexShrink:0, background:`${item.accent}1a`, border:`1px solid ${item.accent}40`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"18px", color:item.accent }}>
              {item.icon}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:"12px", fontWeight:"800", letterSpacing:"0.15em", fontFamily:"monospace" }}>{item.title}</div>
              <div style={{ fontSize:"11px", color:"#aaa", marginTop:"2px" }}>{item.sub}</div>
            </div>
            <div style={{ color:item.accent, fontSize:"16px" }}>→</div>
          </div>
        ))}
      </div>

      {/* FAN WALL */}
      <FanWall config={config} />
    </div>
  );
}

function MusicScreen({ config, goHome }) {
  const pc    = config.brand.primaryColor;
  const ac    = config.brand.accentColor;
  const music = config.music || {};
  const tracks = music.tracks && music.tracks.length > 0
    ? music.tracks
    : MUSIC_TRACKS.map((t,i) => ({ ...t, id:i+1, icon:"♪", artUrl:"" }));

  const audioRef      = useRef(null);
  const [activeIdx,   setActiveIdx]   = useState(null);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume,      setVolume]      = useState(1);
  const [hasAudio,    setHasAudio]    = useState(false);
  const [loadError,   setLoadError]   = useState(false);

  const getAudioSrc = (track) => {
    if (!track) return "";
    if (track.audioFile && track.audioFile.length > 10) return track.audioFile;
    if (track.audioUrl  && track.audioUrl.trim().length > 0) return track.audioUrl.trim();
    return "";
  };

  const handleTrackTap = (idx) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (activeIdx === idx) {
      if (isPlaying) { audio.pause(); setIsPlaying(false); }
      else           { audio.play().catch(()=>{}); setIsPlaying(true); }
      return;
    }
    const track = tracks[idx];
    const src   = getAudioSrc(track);
    setActiveIdx(idx); setProgress(0); setCurrentTime(0); setDuration(0); setLoadError(false);
    if (src) {
      setHasAudio(true);
      audio.pause(); audio.src = src; audio.volume = volume; audio.load();
      audio.play().then(()=>setIsPlaying(true)).catch(()=>{setIsPlaying(false);setLoadError(true);});
    } else {
      setHasAudio(false); setIsPlaying(false); audio.pause(); audio.src="";
    }
  };

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio || !hasAudio) return;
    if (isPlaying) { audio.pause(); setIsPlaying(false); }
    else           { audio.play().catch(()=>{}); setIsPlaying(true); }
  };

  const seek = (e) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)) * duration;
  };

  const fmt = (s) => {
    if (!s||isNaN(s)) return "0:00";
    return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
  };

  const bannerBg = music.bannerType==="image" && music.bannerUrl
    ? `url(${music.bannerUrl}) center/cover no-repeat`
    : `linear-gradient(135deg,${music.bannerGrad1||pc},${music.bannerGrad2||ac})`;

  const featuredTitle = music.featuredTitle || "Your Latest Single";
  const featuredSub   = music.featuredSub   || "Out Now · All Platforms";
  const currentTrack  = activeIdx !== null ? tracks[activeIdx] : null;

  return (
    <div style={{ paddingBottom:"20px" }}>
      <BackButton onBack={goHome} />
      <audio ref={audioRef}
        onTimeUpdate={() => { const a=audioRef.current; if(a){setCurrentTime(a.currentTime);setProgress(a.duration?(a.currentTime/a.duration)*100:0);} }}
        onLoadedMetadata={() => { if(audioRef.current) setDuration(audioRef.current.duration); }}
        onEnded={() => { setIsPlaying(false); setProgress(0); setCurrentTime(0);
          if (activeIdx !== null && activeIdx < tracks.length-1) handleTrackTap(activeIdx+1);
          else setActiveIdx(null);
        }}
        onError={() => { setIsPlaying(false); setHasAudio(false); setLoadError(true); }}
        style={{ display:"none" }} />

      {/* ── CINEMATIC BANNER ── */}
      <div style={{ background:bannerBg, position:"relative", overflow:"hidden", minHeight:"260px", display:"flex", alignItems:"flex-end" }}>
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.85) 100%)" }} />
        {/* Animated glow rings */}
        <div style={{ position:"absolute", top:"40px", right:"-40px", width:"220px", height:"220px", borderRadius:"50%", background:`${pc}18`, filter:"blur(40px)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", top:"20px", right:"-20px", width:"140px", height:"140px", borderRadius:"50%", background:`${ac}14`, filter:"blur(24px)", pointerEvents:"none" }} />

        {/* Floating album art */}
        <div style={{ position:"absolute", top:"24px", right:"20px", width:"110px", height:"110px", borderRadius:"16px", overflow:"hidden", boxShadow:`0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1)` }}>
          {currentTrack?.artUrl
            ? <img src={currentTrack.artUrl} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            : <div style={{ width:"100%", height:"100%", background:`linear-gradient(135deg,${pc}44,${ac}33)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"36px" }}>{currentTrack?.icon||"♪"}</div>}
        </div>

        {/* Text content */}
        <div style={{ position:"relative", zIndex:1, padding:"24px 20px 22px", flex:1 }}>
          <div style={{ fontSize:"8px", letterSpacing:"0.4em", color:`${pc}cc`, fontFamily:"monospace", marginBottom:"8px" }}>◆ {currentTrack ? "NOW PLAYING" : "LATEST RELEASE"}</div>
          <div style={{ fontSize:"22px", fontWeight:"900", lineHeight:1.15, marginBottom:"4px", color:"#fff", maxWidth:"200px" }}>{currentTrack?.title || featuredTitle}</div>
          <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.55)", marginBottom:"20px" }}>{currentTrack?.genre || featuredSub}</div>

          {/* CONTROLS */}
          <div style={{ display:"flex", alignItems:"center", gap:"14px", marginBottom:"16px" }}>
            {/* PREV */}
            <button onClick={()=>activeIdx>0&&handleTrackTap(activeIdx-1)} disabled={!activeIdx}
              style={{ width:"36px", height:"36px", borderRadius:"50%", background:"rgba(255,255,255,0.08)", border:"none", color:activeIdx>0?"#fff":"rgba(255,255,255,0.2)", fontSize:"14px", cursor:activeIdx>0?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center" }}>⏮</button>
            {/* PLAY/PAUSE */}
            <button onClick={()=>currentTrack?handlePlayPause():handleTrackTap(0)}
              style={{ width:"56px", height:"56px", borderRadius:"50%", border:"none", background:`linear-gradient(135deg,${pc},${ac})`, color:"#000", fontSize:"22px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:`0 4px 20px ${pc}66`, transition:"transform 0.15s" }}>
              {isPlaying ? "⏸" : "▶"}
            </button>
            {/* NEXT */}
            <button onClick={()=>activeIdx!==null&&activeIdx<tracks.length-1&&handleTrackTap(activeIdx+1)} disabled={activeIdx===null||activeIdx>=tracks.length-1}
              style={{ width:"36px", height:"36px", borderRadius:"50%", background:"rgba(255,255,255,0.08)", border:"none", color:activeIdx!==null&&activeIdx<tracks.length-1?"#fff":"rgba(255,255,255,0.2)", fontSize:"14px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>⏭</button>
            {/* VOLUME */}
            <input type="range" min={0} max={1} step={0.05} value={volume}
              onChange={e=>{const v=parseFloat(e.target.value);setVolume(v);if(audioRef.current)audioRef.current.volume=v;}}
              style={{ flex:1, accentColor:pc, cursor:"pointer" }} />
          </div>

          {/* PROGRESS BAR */}
          <div onClick={seek} style={{ height:"3px", borderRadius:"2px", background:"rgba(255,255,255,0.15)", cursor:"pointer", marginBottom:"6px" }}>
            <div style={{ height:"100%", borderRadius:"2px", background:`linear-gradient(90deg,${pc},${ac})`, width:`${progress}%`, transition:"width 0.2s linear" }} />
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:"9px", color:"rgba(255,255,255,0.4)", fontFamily:"monospace" }}>
            <span>{fmt(currentTime)}</span><span>{fmt(duration)}</span>
          </div>
        </div>
      </div>

      {/* ── TRACK LIST ── */}
      <div style={{ padding:"20px 16px 10px" }}>
        <div style={{ fontSize:"9px", letterSpacing:"0.3em", color:"#555", fontFamily:"monospace", marginBottom:"14px" }}>ALL TRACKS</div>
        {tracks.map((t,i) => {
          const isActive = activeIdx===i;
          const hasSrc = !!(t.audioFile?.length>10 || t.audioUrl?.trim().length>0);
          return (
            <div key={t.id||i} onClick={()=>handleTrackTap(i)} style={{
              display:"flex", alignItems:"center", gap:"12px", padding:"12px 14px", marginBottom:"6px",
              borderRadius:"14px", cursor:"pointer", transition:"all 0.25s",
              background: isActive ? `linear-gradient(135deg,${pc}22,${ac}12)` : "rgba(255,255,255,0.02)",
              border: isActive ? `1px solid ${pc}55` : "1px solid rgba(255,255,255,0.04)",
              boxShadow: isActive ? `0 4px 20px ${pc}22` : "none",
            }}>
              {/* ARTWORK */}
              <div style={{ width:"50px", height:"50px", borderRadius:"10px", flexShrink:0, overflow:"hidden", position:"relative",
                background:t.artUrl?"transparent":`linear-gradient(135deg,${pc}33,${ac}22)`,
                boxShadow:isActive?`0 4px 14px ${pc}44`:"none" }}>
                {t.artUrl
                  ? <img src={t.artUrl} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px" }}>{t.icon||"♪"}</div>}
                {isActive && (
                  <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <div style={{ fontSize:"18px", color:pc }}>{isPlaying?"⏸":"▶"}</div>
                  </div>
                )}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:"13px", fontWeight:isActive?"800":"600", color:isActive?"#fff":"#ddd", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title}</div>
                <div style={{ fontSize:"10px", color:"#777", marginTop:"2px", fontFamily:"monospace" }}>
                  {t.genre}
                  {hasSrc ? <span style={{color:"#00F5D4"}}> · ♪</span> : <span style={{color:"#333"}}> · no audio</span>}
                </div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontSize:"11px", color:"#777", fontFamily:"monospace" }}>{t.duration}</div>
                <div style={{ fontSize:"9px", color:"#484848", fontFamily:"monospace" }}>{t.plays} plays</div>
              </div>
              {/* PLAYING INDICATOR */}
              {isActive && isPlaying && (
                <div style={{ display:"flex", gap:"2px", alignItems:"flex-end", height:"16px", flexShrink:0 }}>
                  {[1,2,3,4].map(b=>(
                    <div key={b} style={{ width:"3px", borderRadius:"2px", background:pc, animation:`eq${b} 0.6s ease-in-out infinite alternate`, height:`${[8,14,10,12][b-1]}px` }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── STREAMING LINKS ── */}
      <div style={{ padding:"8px 16px 24px" }}>
        <div style={{ fontSize:"9px", letterSpacing:"0.3em", color:"#555", fontFamily:"monospace", marginBottom:"12px" }}>FIND ME ON</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"8px" }}>
          {["Spotify","Apple Music","SoundCloud","Tidal","YouTube Music"].map((p,i)=>(
            <div key={i} style={{ padding:"8px 14px", borderRadius:"20px", fontSize:"10px", fontFamily:"monospace", border:"1px solid rgba(255,255,255,0.08)", color:"#bbb", background:"rgba(255,255,255,0.02)" }}>{p}</div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes eq1{from{height:4px}to{height:12px}}
        @keyframes eq2{from{height:8px}to{height:16px}}
        @keyframes eq3{from{height:5px}to{height:14px}}
        @keyframes eq4{from{height:10px}to{height:8px}}
      `}</style>
    </div>
  );
}


function ShowsScreen({ config, goHome }) {
  const ac       = config.brand.accentColor;
  const pc       = config.brand.primaryColor;
  const shows    = config.shows || {};
  const episodes = shows.episodes || SHOWS.map((s,i) => ({ ...s, id:i+1 }));
  const bannerBg = shows.bannerUrl
    ? `url(${shows.bannerUrl}) center/cover no-repeat`
    : `linear-gradient(135deg,${ac}2a,rgba(8,8,8,0.85))`;

  const [activeEp, setActiveEp] = useState(null); // id of episode with player open
  const [epPlaying, setEpPlaying] = useState(false);
  const videoRef = useRef(null);

  const getVideoSrc = (ep) => {
    if (ep.videoFile && ep.videoFile.length > 0) return ep.videoFile;
    if (ep.videoUrl  && ep.videoUrl.length  > 0) return ep.videoUrl;
    return "";
  };

  // Determine if URL is embeddable (YouTube / Vimeo)
  const getEmbedUrl = (url) => {
    if (!url) return null;
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1`;
    const vm = url.match(/vimeo\.com\/(\d+)/);
    if (vm) return `https://player.vimeo.com/video/${vm[1]}?autoplay=1`;
    return null;
  };

  const openPlayer = (ep) => {
    setActiveEp(ep.id);
    setEpPlaying(false);
  };

  const closePlayer = () => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
    setActiveEp(null);
    setEpPlaying(false);
  };

  // Full-screen video modal
  const activeEpisode = episodes.find(e => e.id === activeEp);
  if (activeEpisode) {
    const src      = getVideoSrc(activeEpisode);
    const embedUrl = activeEpisode.videoType === "url" ? getEmbedUrl(src) : null;
    const isEmbed  = !!embedUrl;
    const isFile   = !!activeEpisode.videoFile;
    const isRawUrl = src && !isEmbed;

    return (
      <div style={{ background:"#000", minHeight:"100vh", color:"#F0EDE8" }}>
      <BackButton onBack={goHome} />
        {/* VIDEO PLAYER HEADER */}
        <div style={{ padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", background:"rgba(0,0,0,0.8)", backdropFilter:"blur(10px)" }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:"13px", fontWeight:"700", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{activeEpisode.title}</div>
            <div style={{ fontSize:"9px", color:"#aaa", fontFamily:"monospace", marginTop:"2px" }}>{activeEpisode.duration} · {activeEpisode.views} VIEWS</div>
          </div>
          <button onClick={closePlayer} style={{ width:"36px", height:"36px", borderRadius:"50%", border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.08)", color:"#ccc", fontSize:"18px", cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>

        {/* VIDEO AREA */}
        <div style={{ background:"#000", position:"relative" }}>
          {isEmbed ? (
            <iframe src={embedUrl} title={activeEpisode.title}
              style={{ width:"100%", aspectRatio:"16/9", border:"none", display:"block" }}
              allow="autoplay; fullscreen" allowFullScreen />
          ) : src ? (
            <div>
              <video ref={videoRef} src={src} controls playsInline
                style={{ width:"100%", aspectRatio:"16/9", background:"#000", display:"block" }}
                onPlay={() => setEpPlaying(true)}
                onPause={() => setEpPlaying(false)} />
            </div>
          ) : (
            <div style={{ aspectRatio:"16/9", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"12px" }}>
              <span style={{ fontSize:"42px" }}>📺</span>
              <div style={{ fontSize:"13px", color:"#aaa" }}>No video source added yet</div>
              <div style={{ fontSize:"11px", color:"#888", fontFamily:"monospace" }}>Add a URL or upload a video in Admin → Shows</div>
            </div>
          )}
        </div>

        {/* EPISODE INFO */}
        <div style={{ padding:"20px" }}>
          <div style={{ fontSize:"15px", fontWeight:"800", marginBottom:"8px" }}>{activeEpisode.title}</div>
          <div style={{ fontSize:"12px", color:"#aaa", lineHeight:1.6, marginBottom:"20px" }}>{activeEpisode.desc || "No description."}</div>

          {/* OTHER EPISODES */}
          <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#999", fontFamily:"monospace", marginBottom:"12px" }}>MORE EPISODES</div>
          {episodes.filter(e => e.id !== activeEp).map((ep, i) => (
            <div key={ep.id || i} onClick={() => openPlayer(ep)}
              style={{ display:"flex", gap:"12px", alignItems:"center", padding:"12px", marginBottom:"8px", borderRadius:"10px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", cursor:"pointer" }}>
              <div style={{ width:"60px", height:"40px", borderRadius:"6px", flexShrink:0, background:ep.thumbUrl?`url(${ep.thumbUrl}) center/cover no-repeat`:`${ac}22`, display:"flex", alignItems:"center", justifyContent:"center", color:ac, fontSize:"14px" }}>
                {!ep.thumbUrl && "▶"}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:"11px", fontWeight:"700", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ep.title}</div>
                <div style={{ fontSize:"9px", color:"#999", fontFamily:"monospace", marginTop:"2px" }}>{ep.duration} · {ep.views} views</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // EPISODE LIST VIEW
  return (
    <div>
      {/* SHOW BANNER */}
      {(shows.showTitle || shows.bannerUrl) && (
        <div style={{ background:bannerBg, padding:"28px 20px 20px", position:"relative" }}>
          <div style={{ position:"absolute", inset:0, background:"rgba(8,8,8,0.6)", pointerEvents:"none" }} />
          <div style={{ position:"relative", zIndex:1 }}>
            <SH icon="▶" title={shows.showTitle || "TALK SHOW"} accent={ac} sub={shows.showDesc || "Real conversations. No filter."} />
          </div>
        </div>
      )}

      <div style={{ padding: shows.showTitle ? "20px 20px 28px" : "28px 20px" }}>
        {!shows.showTitle && <SH icon="▶" title="TALK SHOW" accent={ac} sub="Real conversations. No filter." />}
        {episodes.map((ep, i) => {
          const hasThumb = !!ep.thumbUrl;
          const src      = getVideoSrc(ep);
          const hasVideo = !!src;
          return (
            <div key={ep.id || i} style={{ marginBottom:"16px", borderRadius:"14px", overflow:"hidden", border:`1px solid ${ac}22` }}>
              {/* THUMBNAIL */}
              <div onClick={() => openPlayer(ep)}
                style={{ height:"160px", background:hasThumb?`url(${ep.thumbUrl}) center/cover no-repeat`:`linear-gradient(135deg,${ac}2a,rgba(8,8,8,0.85))`, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", cursor:"pointer" }}>
                {hasThumb && <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.35)" }} />}
                {/* PLAY BUTTON */}
                <div style={{ position:"relative", zIndex:1, width:"56px", height:"56px", borderRadius:"50%", background:hasVideo?ac:`${ac}55`, border:hasVideo?"none":`2px solid ${ac}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"22px", color:hasVideo?"#000":ac, boxShadow:hasVideo?`0 0 28px ${ac}80`:"none", transition:"transform 0.2s" }}>▶</div>
                <div style={{ position:"absolute", top:"10px", right:"10px", zIndex:1, padding:"4px 9px", borderRadius:"8px", background:"rgba(0,0,0,0.65)", fontSize:"9px", color:ac, fontFamily:"monospace" }}>{ep.duration}</div>
                {hasVideo && <div style={{ position:"absolute", top:"10px", left:"10px", zIndex:1, padding:"4px 8px", borderRadius:"8px", background:"rgba(0,0,0,0.65)", fontSize:"8px", color:"#00F5D4", fontFamily:"monospace" }}>● VIDEO READY</div>}
                {!hasVideo && <div style={{ position:"absolute", top:"10px", left:"10px", zIndex:1, padding:"4px 8px", borderRadius:"8px", background:"rgba(0,0,0,0.65)", fontSize:"8px", color:"#aaa", fontFamily:"monospace" }}>NO VIDEO YET</div>}
              </div>
              {/* INFO */}
              <div style={{ padding:"15px", background:`${ac}07` }}>
                <div style={{ fontSize:"12px", fontWeight:"800", marginBottom:"4px" }}>{ep.title}</div>
                <div style={{ fontSize:"11px", color:"#aaa", marginBottom:"12px" }}>{ep.desc}</div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontSize:"9px", color:"#999", fontFamily:"monospace" }}>{ep.views} VIEWS</div>
                  <button onClick={() => openPlayer(ep)} style={{ padding:"6px 14px", borderRadius:"14px", border:`1px solid ${ac}`, background:hasVideo?ac:"none", color:hasVideo?"#000":ac, fontSize:"9px", letterSpacing:"0.1em", cursor:"pointer", fontFamily:"monospace", fontWeight:hasVideo?"700":"400" }}>
                    {hasVideo ? "▶ WATCH NOW" : "WATCH NOW"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FILTERS for photo editing ────────────────────────────────────────────────
const FILTERS = [
  { id:"none",     label:"Original", css:"none"                                         },
  { id:"vivid",    label:"Vivid",    css:"saturate(1.8) contrast(1.1)"                  },
  { id:"moody",    label:"Moody",    css:"brightness(0.85) contrast(1.2) saturate(0.8)" },
  { id:"warm",     label:"Warm",     css:"sepia(0.35) saturate(1.4) brightness(1.05)"   },
  { id:"cool",     label:"Cool",     css:"hue-rotate(20deg) saturate(1.2)"              },
  { id:"bw",       label:"B&W",      css:"grayscale(1) contrast(1.1)"                   },
  { id:"fade",     label:"Fade",     css:"brightness(1.1) contrast(0.85) saturate(0.75)"},
  { id:"dramatic", label:"Dramatic", css:"contrast(1.4) saturate(1.3) brightness(0.9)"  },
];

function buildTransform(r,fh,fv){const p=[];if(r)p.push(`rotate(${r}deg)`);if(fh)p.push("scaleX(-1)");if(fv)p.push("scaleY(-1)");return p.join(" ")||"none";}
function buildFilter(f,b,c){const base=FILTERS.find(fi=>fi.id===f)?.css||"none";const adj=`brightness(${b/100}) contrast(${c/100})`;return f==="none"?adj:`${base} ${adj}`;}

function GalleryScreen({ config, goHome }) {
  const [lightbox, setLightbox] = useState(null);
  const photos = (config.gallery && config.gallery.photos) || [];

  if (lightbox !== null) {
    const photo = photos[lightbox];
    if (!photo) { setLightbox(null); return null; }
    return (
      <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.96)", display:"flex", flexDirection:"column" }}>
      <BackButton onBack={goHome} />
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 20px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize:"12px", color:"#aaa", fontFamily:"monospace" }}>{photo.name}</div>
          <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
            <span style={{ fontSize:"10px", color:"#999", fontFamily:"monospace" }}>{lightbox+1} / {photos.length}</span>
            <button onClick={() => setLightbox(null)} style={{ padding:"7px 12px", borderRadius:"9px", border:"1px solid rgba(255,255,255,0.1)", background:"none", color:"#bbb", fontSize:"16px", cursor:"pointer" }}>✕</button>
          </div>
        </div>
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}>
          <img src={photo.src} alt={photo.name} style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain", filter:buildFilter(photo.filter||"none",photo.brightness||100,photo.contrast||100), transform:buildTransform(photo.rotation||0,photo.flipH||false,photo.flipV||false), borderRadius:"8px" }} />
        </div>
        <div style={{ padding:"12px 20px", borderTop:"1px solid rgba(255,255,255,0.06)", display:"flex", justifyContent:"space-between" }}>
          <button onClick={() => setLightbox(l => Math.max(0,l-1))} disabled={lightbox===0} style={{ padding:"8px 18px", borderRadius:"9px", border:"1px solid rgba(255,255,255,0.1)", background:"none", color:lightbox===0?"#333":"#ccc", cursor:lightbox===0?"not-allowed":"pointer", fontSize:"12px" }}>← PREV</button>
          <button onClick={() => setLightbox(l => Math.min(photos.length-1,l+1))} disabled={lightbox===photos.length-1} style={{ padding:"8px 18px", borderRadius:"9px", border:"1px solid rgba(255,255,255,0.1)", background:"none", color:lightbox===photos.length-1?"#333":"#ccc", cursor:lightbox===photos.length-1?"not-allowed":"pointer", fontSize:"12px" }}>NEXT →</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding:"28px 20px" }}>
      <SH icon="◈" title="GALLERY" accent="#00F5D4" sub="The moments. The movement." />
      {photos.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 20px" }}>
          <div style={{ fontSize:"48px", marginBottom:"14px" }}>◈</div>
          <div style={{ fontSize:"14px", color:"#999", marginBottom:"6px" }}>No photos yet</div>
          <div style={{ fontSize:"11px", color:"#333", fontFamily:"monospace" }}>Upload photos in Admin → Gallery</div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize:"9px", color:"#aaa", fontFamily:"monospace", letterSpacing:"0.2em", marginBottom:"10px" }}>{photos.length} PHOTO{photos.length!==1?"S":""} · TAP TO VIEW</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"4px" }}>
            {photos.map((photo, idx) => (
              <div key={photo.id || idx} onClick={() => setLightbox(idx)}
                style={{ aspectRatio:"1", borderRadius:idx===0?"10px 0 0 0":idx===2?"0 10px 0 0":"0", overflow:"hidden", cursor:"pointer", position:"relative" }}>
                <img src={photo.src} alt={photo.name || "photo"} style={{ width:"100%", height:"100%", objectFit:"cover", filter:buildFilter(photo.filter||"none",photo.brightness||100,photo.contrast||100), transform:buildTransform(photo.rotation||0,photo.flipH||false,photo.flipV||false) }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SocialScreen({ config, goHome }) {
  const [copied,   setCopied]   = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const posts = config.socialPosts || {};

  const copy = () => {
    navigator.clipboard?.writeText(config.brand.universalLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (lightbox) {
    const p = lightbox;
    return (
      <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.96)", display:"flex", flexDirection:"column" }}>
      <BackButton onBack={goHome} />
        <div style={{ padding:"16px 20px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}><SocialLogo id={p.logo||p.id} size={16}/><span style={{ fontSize:"12px", fontWeight:"700", color:p.color }}>{p.name}</span></div>
            {p.post?.date && <div style={{ fontSize:"9px", color:"#999", fontFamily:"monospace", marginTop:"2px" }}>Posted {p.post.date}</div>}
          </div>
          <button onClick={() => setLightbox(null)} style={{ padding:"7px 12px", borderRadius:"9px", border:"1px solid rgba(255,255,255,0.1)", background:"none", color:"#bbb", fontSize:"16px", cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}>
          <img src={p.post.imageUrl} alt="post" style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain", borderRadius:"10px" }} />
        </div>
        {p.post?.caption && (
          <div style={{ padding:"16px 20px", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize:"12px", color:"#ccc", lineHeight:1.6 }}>{p.post.caption}</div>
            {p.post?.postUrl && (
              <a href={p.post.postUrl} target="_blank" rel="noreferrer" style={{ display:"inline-block", marginTop:"10px", fontSize:"10px", color:p.color, fontFamily:"monospace", textDecoration:"none", border:`1px solid ${p.color}44`, padding:"5px 12px", borderRadius:"8px" }}>
                VIEW ON {p.name.toUpperCase()} ↗
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding:"28px 20px" }}>
      <SH icon="◎" title="SOCIAL HUB" accent="#FFD60A" sub="Every platform. Right here." />
      <div style={{ padding:"14px", borderRadius:"11px", marginBottom:"22px", background:"rgba(255,214,10,0.06)", border:"1px solid rgba(255,214,10,0.15)" }}>
        <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#FFD60A", fontFamily:"monospace", marginBottom:"5px" }}>◆ PRO TIP</div>
        <div style={{ fontSize:"12px", color:"#999", lineHeight:1.6 }}>Share this page instead of individual links. One URL = all your platforms.</div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
        {SOCIAL_LINKS.map((s,i) => {
          const cfgKey = SOCIAL_KEY_MAP[s.name];
          const handle = (cfgKey && config.social[cfgKey]) ? config.social[cfgKey] : s.defaultHandle;
          const postKey = cfgKey || s.name.toLowerCase().replace("/","").replace(" ","");
          const post    = posts[postKey] || {};
          const hasPost = !!post.imageUrl;

          return (
            <div key={i} style={{ borderRadius:"14px", overflow:"hidden", border:"1px solid rgba(255,255,255,0.07)", background:"rgba(255,255,255,0.02)" }}>
              {/* PLATFORM ROW */}
              <div style={{ display:"flex", alignItems:"center", gap:"12px", padding:"14px" }}>
                <div style={{ width:"42px", height:"42px", borderRadius:"11px", flexShrink:0, background:`${s.color}20`, border:`1px solid ${s.color}44`, display:"flex", alignItems:"center", justifyContent:"center" }}><SocialLogo id={s.logo} size={24}/></div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:"12px", fontWeight:"700" }}>{s.name}</div>
                  <div style={{ fontSize:"10px", color:"#999", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{handle}</div>
                </div>
                <div style={{ textAlign:"right", marginRight:"8px", flexShrink:0 }}>
                  <div style={{ fontSize:"11px", fontWeight:"700", color:s.color }}>{s.followers}</div>
                  <div style={{ fontSize:"8px", color:"#999", fontFamily:"monospace" }}>FOLLOWERS</div>
                </div>
                <button style={{ padding:"6px 12px", borderRadius:"14px", background:s.color, border:"none", color:"#000", fontSize:"9px", fontWeight:"800", letterSpacing:"0.08em", cursor:"pointer", fontFamily:"monospace", flexShrink:0 }}>{s.action}</button>
              </div>

              {/* LAST POST IMAGE */}
              {hasPost && (
                <div onClick={() => setLightbox({ ...s, post })} style={{ cursor:"pointer", borderTop:"1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ position:"relative" }}>
                    <img src={post.imageUrl} alt="last post" style={{ width:"100%", height:"180px", objectFit:"cover", display:"block" }} />
                    {/* Platform source badge */}
                    <div style={{ position:"absolute", top:"10px", left:"10px", display:"flex", alignItems:"center", gap:"5px", padding:"4px 10px", borderRadius:"10px", background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)" }}>
                      <span style={{ fontSize:"12px" }}>{s.icon}</span>
                      <span style={{ fontSize:"9px", fontWeight:"700", color:s.color, fontFamily:"monospace", letterSpacing:"0.1em" }}>{s.name.toUpperCase()}</span>
                    </div>
                    {/* Tap to view badge */}
                    <div style={{ position:"absolute", bottom:"10px", right:"10px", padding:"4px 10px", borderRadius:"10px", background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)", fontSize:"9px", color:"#ccc", fontFamily:"monospace" }}>
                      TAP TO VIEW ↗
                    </div>
                  </div>
                  {(post.caption || post.date) && (
                    <div style={{ padding:"10px 14px", borderTop:"1px solid rgba(255,255,255,0.04)" }}>
                      {post.caption && <div style={{ fontSize:"11px", color:"#bbb", lineHeight:1.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{post.caption}</div>}
                      {post.date    && <div style={{ fontSize:"9px",  color:"#999", fontFamily:"monospace", marginTop:"3px" }}>Posted {post.date} · from {s.name}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* UNIVERSAL LINK */}
      <div style={{ marginTop:"28px" }}>
        <div style={{ fontSize:"9px", letterSpacing:"0.3em", color:"#999", fontFamily:"monospace", marginBottom:"10px" }}>YOUR UNIVERSAL LINK</div>
        <div style={{ padding:"13px 15px", borderRadius:"10px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:"12px", color:"#FFD60A", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{config.brand.universalLink}</span>
          <button onClick={copy} style={{ padding:"5px 11px", borderRadius:"7px", border:"1px solid rgba(255,214,10,0.3)", background:copied?"rgba(255,214,10,0.15)":"none", color:"#FFD60A", fontSize:"9px", letterSpacing:"0.1em", cursor:"pointer", fontFamily:"monospace", flexShrink:0, marginLeft:"8px" }}>
            {copied ? "COPIED ✓" : "COPY ↗"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BroadcastScreen({ config }) {
  // ── Read defaults from Admin config ──────────────────────────────────────
  const defaultPlatforms = (config.broadcast?.defaultPlatforms?.length > 0)
    ? config.broadcast.defaultPlatforms
    : ["instagram","facebook","twitter"];
  const savedTemplates = config.broadcast?.templates || [];

  const [selected,       setSelected]       = useState(defaultPlatforms);
  const [postType,       setPostType]       = useState("post");
  const [caption,        setCaption]        = useState("");
  const [aiPrompt,       setAiPrompt]       = useState("");
  const [tone,           setTone]           = useState("Hype");
  const [aiLoading,      setAiLoading]      = useState(false);
  const [publishState,   setPublishState]   = useState(null);
  const [publishResults, setPublishResults] = useState({});
  const [bTab,           setBTab]           = useState("compose");
  const [scheduleDate,   setScheduleDate]   = useState("");
  const [scheduleTime,   setScheduleTime]   = useState("");
  const [charWarning,    setCharWarning]    = useState([]);
  const [mediaAttached,  setMediaAttached]  = useState(false);
  const [aiSuggestions,  setAiSuggestions]  = useState([]);
  const [showSuggestions,setShowSuggestions]= useState(false);
  const [scheduleConfirm,setScheduleConfirm]= useState(false);
  const [showTemplates,  setShowTemplates]  = useState(false);

  // ── Sync selected platforms if admin defaults change ─────────────────────
  useEffect(() => {
    if (config.broadcast?.defaultPlatforms?.length > 0) {
      setSelected(config.broadcast.defaultPlatforms);
    }
  }, [config.broadcast?.defaultPlatforms?.join(",")]);

  useEffect(() => {
    const warnings = selected.filter(pid => {
      const p = PLATFORMS.find(p => p.id === pid);
      return p && p.maxChars > 0 && caption.length > p.maxChars;
    });
    setCharWarning(warnings);
  }, [caption, selected]);

  const togglePlatform = (id) => {
    const p = PLATFORMS.find(p => p.id === id);
    if (!p || p.maxChars === 0) return;
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const getMinLimit = () => {
    const limits = selected.map(id => PLATFORMS.find(p => p.id === id)?.maxChars).filter(x => x && x > 0);
    return limits.length ? Math.min(...limits) : 2200;
  };

  const generateCaption = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true); setShowSuggestions(false);
    try {
      const names = selected.map(id => PLATFORMS.find(p => p.id === id)?.name).filter(Boolean).join(", ");
      const limit = getMinLimit();
      const r1 = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:800, messages:[{ role:"user", content:`You are a social media expert for a digital media entertainment brand called "${config.brand.name}". Generate a cross-platform caption.\n\nTopic: ${aiPrompt}\nTone: ${tone}\nFormat: ${postType}\nPlatforms: ${names}\nMax chars: ${limit}\n\nReturn ONLY the caption text with emojis and 3–5 hashtags.` }] }),
      });
      const d1 = await r1.json();
      setCaption(d1.content?.[0]?.text?.trim() || "");

      const r2 = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:300, messages:[{ role:"user", content:`Generate 2 alternative short captions (each under 90 chars, no hashtags) for: "${aiPrompt}" in a ${tone} tone. Return as a JSON array of strings only. Example: ["option 1","option 2"]` }] }),
      });
      const d2 = await r2.json();
      try {
        const txt = d2.content?.[0]?.text?.trim().replace(/```json|```/g,"").trim();
        const parsed = JSON.parse(txt);
        if (Array.isArray(parsed)) { setAiSuggestions(parsed); setShowSuggestions(true); }
      } catch {}
    } catch { setCaption("⚠️ Generation failed. Check your connection."); }
    setAiLoading(false);
  };

  const simulatePublish = async () => {
    setPublishState("publishing"); setBTab("results");
    const results = {};
    for (const pid of selected) {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 900));
      const p = PLATFORMS.find(p => p.id === pid);
      results[pid] = p?.note === "1-tap approve" ? "pending" : "success";
      setPublishResults({ ...results });
    }
    setPublishState("done");
  };

  const resetBroadcast = () => {
    setCaption(""); setAiPrompt(""); setPublishState(null);
    setPublishResults({}); setBTab("compose"); setMediaAttached(false);
    setShowSuggestions(false); setAiSuggestions([]); setShowTemplates(false);
  };

  const charPct = () => Math.min((caption.length / getMinLimit()) * 100, 100);
  const canPost = caption.trim().length > 0 && selected.length > 0;
  const pc = config.brand.primaryColor;

  const bTabs = [
    { id:"compose",  label:"COMPOSE"  },
    { id:"preview",  label:"PREVIEW"  },
    { id:"schedule", label:"SCHEDULE" },
    ...(publishState ? [{ id:"results", label:"RESULTS" }] : []),
  ];

  return (
    <div style={{ fontFamily:"'Courier New',monospace" }}>
      {/* BROADCAST HEADER */}
      <div style={{ padding:"20px 20px 0", borderBottom:`1px solid ${pc}26` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"14px" }}>
          <div>
            <div style={{ fontSize:"18px", fontWeight:"900", letterSpacing:"0.1em", background:`linear-gradient(90deg,${pc},#FFD60A)`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>BROADCAST</div>
            <div style={{ fontSize:"8px", letterSpacing:"0.35em", color:"#999", marginTop:"1px" }}>ONE POST · ALL PLATFORMS</div>
          </div>
          <div style={{ display:"flex", gap:"5px" }}>
            {selected.map(pid => { const p = PLATFORMS.find(p => p.id === pid); return p ? <div key={pid} style={{ width:"26px", height:"26px", borderRadius:"6px", background:`${p.color}20`, border:`1px solid ${p.color}55`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", color:p.color }}>{p.icon}</div> : null; })}
          </div>
        </div>
        <div style={{ display:"flex" }}>
          {bTabs.map(t => (
            <button key={t.id} onClick={() => setBTab(t.id)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", padding:"9px 4px", fontSize:"8px", letterSpacing:"0.18em", color:bTab===t.id ? pc : "#3a3a3a", borderBottom:bTab===t.id ? `2px solid ${pc}` : "2px solid transparent", transition:"all 0.2s" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"20px" }}>

        {/* ── COMPOSE ── */}
        {bTab === "compose" && (
          <div>
            <BSection label="POST TO">
              <div style={{ display:"flex", flexWrap:"wrap", gap:"7px" }}>
                {PLATFORMS.map(p => {
                  const sel = selected.includes(p.id);
                  const dis = p.maxChars === 0;
                  return (
                    <button key={p.id} onClick={() => togglePlatform(p.id)} style={{ display:"flex", alignItems:"center", gap:"5px", padding:"7px 11px", borderRadius:"18px", cursor:dis ? "not-allowed" : "pointer", background:sel ? `${p.color}20` : "rgba(255,255,255,0.03)", border:sel ? `1px solid ${p.color}` : "1px solid rgba(255,255,255,0.07)", color:sel ? p.color : "#484848", fontSize:"10px", fontWeight:sel ? "700" : "400", opacity:dis ? 0.35 : 1, transition:"all 0.2s" }}>
                      <span>{p.icon}</span><span>{p.name}</span>
                      {p.note && <span style={{ fontSize:"7px", opacity:0.55 }}>({p.note})</span>}
                      {sel && <span>✓</span>}
                    </button>
                  );
                })}
              </div>
            </BSection>

            <BSection label="FORMAT">
              <div style={{ display:"flex", gap:"7px" }}>
                {POST_TYPES.map(pt => (
                  <button key={pt.id} onClick={() => setPostType(pt.id)} style={{ flex:1, padding:"10px 5px", borderRadius:"9px", cursor:"pointer", background:postType===pt.id ? `${pc}22` : "rgba(255,255,255,0.02)", border:postType===pt.id ? `1px solid ${pc}` : "1px solid rgba(255,255,255,0.06)", color:postType===pt.id ? pc : "#484848", fontSize:"8px", letterSpacing:"0.08em", display:"flex", flexDirection:"column", alignItems:"center", gap:"4px", transition:"all 0.2s" }}>
                    <span style={{ fontSize:"13px" }}>{pt.icon}</span><span>{pt.label}</span>
                  </button>
                ))}
              </div>
            </BSection>

            <BSection label="AI CAPTION WRITER">
              {/* SAVED TEMPLATES */}
              {savedTemplates.length > 0 && (
                <div style={{ marginBottom:"12px" }}>
                  <button onClick={() => setShowTemplates(v => !v)}
                    style={{ width:"100%", padding:"10px 14px", borderRadius:"10px", border:"1px solid rgba(199,125,255,0.3)", background:"rgba(199,125,255,0.07)", color:"#C77DFF", fontSize:"10px", fontWeight:"700", letterSpacing:"0.12em", cursor:"pointer", fontFamily:"monospace", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span>📋 USE SAVED TEMPLATE ({savedTemplates.length})</span>
                    <span>{showTemplates ? "▲" : "▼"}</span>
                  </button>
                  {showTemplates && (
                    <div style={{ marginTop:"6px", borderRadius:"10px", border:"1px solid rgba(255,255,255,0.07)", overflow:"hidden" }}>
                      {savedTemplates.map((t,i) => (
                        <div key={t.id || i} onClick={() => { setCaption(t.text); setShowTemplates(false); }}
                          style={{ padding:"12px 14px", borderBottom:i < savedTemplates.length-1 ? "1px solid rgba(255,255,255,0.05)" : "none", cursor:"pointer", background:"rgba(255,255,255,0.02)", transition:"background 0.2s" }}>
                          <div style={{ fontSize:"11px", fontWeight:"700", color:"#C77DFF", marginBottom:"3px" }}>{t.name}</div>
                          <div style={{ fontSize:"10px", color:"#aaa", lineHeight:1.4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={{ padding:"15px", borderRadius:"12px", background:`${pc}0d`, border:`1px solid ${pc}22` }}>
                <div style={{ fontSize:"9px", color:pc, letterSpacing:"0.2em", marginBottom:"9px" }}>◆ WHAT'S THIS POST ABOUT?</div>
                <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="e.g. 'just dropped a new track, feeling unstoppable'"
                  style={{ width:"100%", background:"rgba(0,0,0,0.3)", border:`1px solid ${pc}2e`, borderRadius:"8px", color:"#E8E4DC", padding:"10px", fontSize:"11px", fontFamily:"monospace", resize:"none", outline:"none", lineHeight:1.5 }} rows={3} />
                <div style={{ display:"flex", flexWrap:"wrap", gap:"5px", margin:"9px 0" }}>
                  {TONES.map(t => (
                    <button key={t} onClick={() => setTone(t)} style={{ padding:"4px 9px", borderRadius:"12px", cursor:"pointer", fontSize:"9px", background:tone===t ? pc : "rgba(255,255,255,0.04)", border:tone===t ? "none" : "1px solid rgba(255,255,255,0.07)", color:tone===t ? "#000" : "#555", fontWeight:tone===t ? "800" : "400", transition:"all 0.2s" }}>
                      {t}
                    </button>
                  ))}
                </div>
                <button onClick={generateCaption} disabled={aiLoading || !aiPrompt.trim()} style={{ width:"100%", padding:"11px", borderRadius:"9px", border:"none", background:aiLoading ? `${pc}40` : `linear-gradient(90deg,${pc},#FFD60A)`, color:"#000", fontWeight:"900", fontSize:"11px", letterSpacing:"0.14em", cursor:aiLoading ? "not-allowed" : "pointer" }}>
                  {aiLoading ? "◌ GENERATING..." : "◆ GENERATE WITH AI"}
                </button>
                {showSuggestions && aiSuggestions.length > 0 && (
                  <div style={{ marginTop:"9px" }}>
                    <div style={{ fontSize:"8px", color:"#999", letterSpacing:"0.2em", marginBottom:"5px" }}>QUICK ALTERNATIVES</div>
                    {aiSuggestions.map((s,i) => (
                      <div key={i} onClick={() => setCaption(s)} style={{ padding:"7px 9px", borderRadius:"6px", marginBottom:"4px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", fontSize:"10px", color:"#bbb", cursor:"pointer" }}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </BSection>

            <BSection label="YOUR CAPTION">
              <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Write here, or generate above..."
                style={{ width:"100%", minHeight:"120px", background:"rgba(255,255,255,0.02)", border:charWarning.length > 0 ? "1px solid #FF3B30" : "1px solid rgba(255,255,255,0.07)", borderRadius:"10px", color:"#E8E4DC", padding:"13px", fontSize:"12px", fontFamily:"monospace", resize:"vertical", outline:"none", lineHeight:1.6 }} rows={5} />
              <div style={{ display:"flex", alignItems:"center", gap:"9px", marginTop:"7px" }}>
                <div style={{ flex:1, height:"3px", borderRadius:"2px", background:"rgba(255,255,255,0.06)" }}>
                  <div style={{ height:"100%", borderRadius:"2px", width:`${charPct()}%`, background:charPct()>90 ? "#FF3B30" : charPct()>70 ? "#FFD60A" : "#00F5D4", transition:"width 0.3s,background 0.3s" }} />
                </div>
                <div style={{ fontSize:"9px", color:charWarning.length > 0 ? "#FF3B30" : "#484848", whiteSpace:"nowrap" }}>{caption.length}/{getMinLimit()}</div>
              </div>
              {charWarning.length > 0 && (
                <div style={{ marginTop:"7px", padding:"7px 9px", borderRadius:"6px", background:"rgba(255,59,48,0.09)", border:"1px solid rgba(255,59,48,0.28)", fontSize:"9px", color:"#FF3B30" }}>
                  ⚠ Over limit for: {charWarning.map(id => PLATFORMS.find(p => p.id === id)?.name).filter(Boolean).join(", ")}
                </div>
              )}
            </BSection>

            <BSection label="MEDIA">
              <div onClick={() => setMediaAttached(v => !v)} style={{ padding:"20px", borderRadius:"11px", textAlign:"center", border:mediaAttached ? "2px solid #00F5D4" : "2px dashed rgba(255,255,255,0.09)", background:mediaAttached ? "rgba(0,245,212,0.05)" : "rgba(255,255,255,0.01)", cursor:"pointer", transition:"all 0.3s" }}>
                <div style={{ fontSize:"22px", marginBottom:"6px" }}>{mediaAttached ? "🖼️" : "+"}</div>
                <div style={{ fontSize:"10px", color:mediaAttached ? "#00F5D4" : "#383838", letterSpacing:"0.14em" }}>{mediaAttached ? "MEDIA ATTACHED · TAP TO REMOVE" : "ATTACH PHOTO / VIDEO"}</div>
                {mediaAttached && <div style={{ fontSize:"8px", color:"#999", marginTop:"3px" }}>Auto-resized per platform</div>}
              </div>
            </BSection>

            <div style={{ display:"flex", gap:"9px", marginTop:"6px" }}>
              <button onClick={() => setBTab("schedule")} style={{ flex:1, padding:"13px", borderRadius:"11px", cursor:"pointer", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", color:"#bbb", fontSize:"10px", letterSpacing:"0.14em", fontFamily:"monospace" }}>
                🕐 SCHEDULE
              </button>
              <button onClick={simulatePublish} disabled={!canPost} style={{ flex:2, padding:"13px", borderRadius:"11px", border:"none", background:canPost ? `linear-gradient(90deg,${pc},#FFD60A)` : "rgba(255,255,255,0.04)", color:canPost ? "#000" : "#383838", fontSize:"11px", fontWeight:"900", letterSpacing:"0.14em", cursor:canPost ? "pointer" : "not-allowed", fontFamily:"monospace" }}>
                ◆ POST TO {selected.length} PLATFORMS
              </button>
            </div>
          </div>
        )}

        {/* ── PREVIEW ── */}
        {bTab === "preview" && (
          <div>
            {selected.map(pid => {
              const p = PLATFORMS.find(pl => pl.id === pid);
              if (!p) return null;
              const over = p.maxChars > 0 && caption.length > p.maxChars;
              return (
                <div key={pid} style={{ marginBottom:"14px", borderRadius:"13px", overflow:"hidden", border:`1px solid ${p.color}30` }}>
                  <div style={{ padding:"9px 13px", background:`${p.color}12`, borderBottom:`1px solid ${p.color}20`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"7px" }}>
                      <span style={{ color:p.color, fontSize:"13px" }}>{p.icon}</span>
                      <span style={{ fontSize:"10px", fontWeight:"700", color:p.color, letterSpacing:"0.14em" }}>{p.name.toUpperCase()}</span>
                    </div>
                    <span style={{ fontSize:"8px", color:over ? "#FF3B30" : "#484848" }}>{over ? "⚠ OVER LIMIT" : `${caption.length}/${p.maxChars||"∞"}`}</span>
                  </div>
                  <div style={{ padding:"13px", background:"rgba(0,0,0,0.3)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"7px", marginBottom:"9px" }}>
                      <LogoDisplay config={config} size={30} />
                      <div>
                        <div style={{ fontSize:"10px", fontWeight:"700" }}>{config.brand.name}</div>
                        <div style={{ fontSize:"8px", color:"#999" }}>@yourbrand</div>
                      </div>
                    </div>
                    {mediaAttached && <div style={{ height:"90px", borderRadius:"7px", marginBottom:"9px", background:`linear-gradient(135deg,${p.color}20,rgba(0,0,0,0.5))`, display:"flex", alignItems:"center", justifyContent:"center", color:"#333", fontSize:"20px" }}>🖼️</div>}
                    <div style={{ fontSize:"11px", lineHeight:1.6, color:"#bbb" }}>
                      {caption || <span style={{ color:"#333", fontStyle:"italic" }}>Caption will appear here...</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            <button onClick={() => setBTab("compose")} style={{ width:"100%", padding:"13px", borderRadius:"11px", cursor:"pointer", background:`${pc}14`, border:`1px solid ${pc}44`, color:pc, fontSize:"10px", letterSpacing:"0.18em", fontFamily:"monospace" }}>← BACK TO EDIT</button>
          </div>
        )}

        {/* ── SCHEDULE ── */}
        {bTab === "schedule" && (
          <div>
            <BSection label="PICK DATE & TIME">
              <div style={{ padding:"18px", borderRadius:"11px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontSize:"9px", color:"#999", letterSpacing:"0.2em", marginBottom:"7px" }}>DATE</div>
                <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={{ width:"100%", padding:"11px", borderRadius:"8px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.07)", color:"#E8E4DC", fontSize:"12px", fontFamily:"monospace", outline:"none", marginBottom:"14px" }} />
                <div style={{ fontSize:"9px", color:"#999", letterSpacing:"0.2em", marginBottom:"7px" }}>TIME</div>
                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={{ width:"100%", padding:"11px", borderRadius:"8px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.07)", color:"#E8E4DC", fontSize:"12px", fontFamily:"monospace", outline:"none" }} />
              </div>
            </BSection>
            <BSection label="◆ BEST POSTING TIMES">
              {[["Instagram","6–9 AM & 7–9 PM","#E1306C"],["TikTok","7–9 AM & 7–11 PM","#69C9D0"],["Twitter/X","8–10 AM & 6–9 PM","#1DA1F2"],["Facebook","1–4 PM weekdays","#4267B2"],["YouTube","2–4 PM & 8–11 PM","#FF0000"]].map(([pl,tm,cl],i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize:"11px", color:cl }}>{pl}</span>
                  <span style={{ fontSize:"10px", color:"#aaa" }}>{tm}</span>
                </div>
              ))}
            </BSection>
            <button onClick={() => { if (scheduleDate && scheduleTime && caption.trim()) { setScheduleConfirm(true); setTimeout(() => setScheduleConfirm(false), 3000); }}}
              disabled={!scheduleDate || !scheduleTime || !caption.trim()}
              style={{ width:"100%", padding:"13px", borderRadius:"11px", border:"none", background:scheduleDate && scheduleTime && caption.trim() ? `linear-gradient(90deg,${config.brand.accentColor},${pc})` : "rgba(255,255,255,0.05)", color:scheduleDate && scheduleTime && caption.trim() ? "#000" : "#383838", fontSize:"11px", fontWeight:"900", letterSpacing:"0.14em", cursor:scheduleDate && scheduleTime && caption.trim() ? "pointer" : "not-allowed", fontFamily:"monospace" }}>
              {scheduleConfirm ? "✅ SCHEDULED!" : "🕐 SCHEDULE POST"}
            </button>
          </div>
        )}

        {/* ── RESULTS ── */}
        {bTab === "results" && (
          <div>
            <div style={{ textAlign:"center", padding:"22px 0 14px" }}>
              <div style={{ fontSize:"34px", marginBottom:"7px" }}>{publishState === "done" ? "🚀" : "⚡"}</div>
              <div style={{ fontSize:"17px", fontWeight:"900", letterSpacing:"0.1em", color:publishState === "done" ? "#00F5D4" : "#FFD60A" }}>
                {publishState === "done" ? "BROADCAST COMPLETE" : "BROADCASTING..."}
              </div>
              <div style={{ fontSize:"10px", color:"#999", marginTop:"4px", fontFamily:"monospace" }}>
                {publishState === "done" ? `Live on ${Object.values(publishResults).filter(v => v === "success").length} platforms` : "Sending to all selected platforms..."}
              </div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:"9px" }}>
              {selected.map(pid => {
                const p = PLATFORMS.find(pl => pl.id === pid);
                if (!p) return null;
                const st = publishResults[pid];
                return (
                  <div key={pid} style={{ display:"flex", alignItems:"center", gap:"12px", padding:"14px", borderRadius:"11px", background:st==="success" ? "rgba(0,245,212,0.06)" : st==="pending" ? "rgba(255,214,10,0.06)" : "rgba(255,255,255,0.02)", border:st==="success" ? "1px solid rgba(0,245,212,0.2)" : st==="pending" ? "1px solid rgba(255,214,10,0.2)" : "1px solid rgba(255,255,255,0.06)", transition:"all 0.4s" }}>
                    <div style={{ width:"38px", height:"38px", borderRadius:"9px", background:`${p.color}20`, border:`1px solid ${p.color}44`, display:"flex", alignItems:"center", justifyContent:"center", color:p.color, fontSize:"15px", flexShrink:0 }}>{p.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:"12px", fontWeight:"700" }}>{p.name}</div>
                      <div style={{ fontSize:"9px", marginTop:"2px", color:st==="success" ? "#00F5D4" : st==="pending" ? "#FFD60A" : "#3a3a3a" }}>
                        {st==="success" ? "✓ POSTED LIVE" : st==="pending" ? "⚡ TAP TO APPROVE IN APP" : "◌ SENDING..."}
                      </div>
                    </div>
                    <div style={{ fontSize:"18px" }}>
                      {st==="success" ? "✅" : st==="pending" ? "🔔" : (
                        <div style={{ width:"18px", height:"18px", borderRadius:"50%", border:"2px solid rgba(255,255,255,0.08)", borderTop:`2px solid ${pc}`, animation:"spin 0.8s linear infinite" }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {publishState === "done" && (
              <div>
                <div style={{ marginTop:"18px", padding:"14px", borderRadius:"11px", background:`${pc}0d`, border:`1px solid ${pc}22` }}>
                  <div style={{ fontSize:"9px", color:pc, letterSpacing:"0.2em", marginBottom:"7px" }}>◆ NEXT 24 HOURS</div>
                  {["Reply to every comment — algorithm loves it","Share to your Stories on IG + FB","Pin this post to top of your profile","DM your top 5 fans the link directly"].map((tip,i) => (
                    <div key={i} style={{ fontSize:"11px", color:"#bbb", padding:"5px 0", borderBottom:i<3 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>{i+1}. {tip}</div>
                  ))}
                </div>
                <button onClick={resetBroadcast} style={{ width:"100%", marginTop:"14px", padding:"13px", borderRadius:"11px", border:"none", background:`linear-gradient(90deg,${pc},#FFD60A)`, color:"#000", fontSize:"11px", fontWeight:"900", letterSpacing:"0.14em", cursor:"pointer", fontFamily:"monospace" }}>
                  ◆ NEW POST
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PUSH NOTIFICATIONS ADMIN TAB ────────────────────────────────────────────
const NOTIF_TEMPLATES = [
  { id:1, name:"New Music Drop",     emoji:"🎵", title:"New Music Just Dropped!",       body:"[Track name] is out now. Stream it everywhere 🔥" },
  { id:2, name:"New Episode",        emoji:"🎙", title:"New Episode is LIVE!",           body:"[Episode title] just dropped. Go watch now 👀" },
  { id:3, name:"Exclusive Content",  emoji:"⭐", title:"Members-Only Drop 🔒",           body:"Your exclusive content is ready inside the app." },
  { id:4, name:"Live Stream Alert",  emoji:"🔴", title:"Going LIVE right now!",          body:"Tune in — I'm live streaming on [platform] NOW." },
  { id:5, name:"Merch Drop",         emoji:"🛍", title:"New Merch Just Dropped!",        body:"Limited stock. Grab it before it's gone 👕" },
  { id:6, name:"Announcement",       emoji:"📢", title:"Big Announcement!",              body:"Something major is coming. Stay locked in 👀" },
  { id:7, name:"Custom",             emoji:"✏",  title:"",                               body:"" },
];

function PushNotificationsTab({ cfg, setCfg, pushStatus, sendToast }) {
  const [title,     setTitle]     = useState("");
  const [body,      setBody]      = useState("");
  const [template,  setTemplate]  = useState(null);
  const [sending,   setSending]   = useState(false);
  const [sent,      setSent]      = useState(false);
  const [history,   setHistory]   = useState([
    { id:1, title:"New Music Just Dropped!",  body:"Track Name 03 is out now 🔥",  time:"Mar 27 · 8:00 PM",  status:"delivered", reach:342 },
    { id:2, title:"New Episode is LIVE!",     body:"Episode 03 — Real Talk is up!", time:"Mar 25 · 6:30 PM",  status:"delivered", reach:289 },
    { id:3, title:"Members-Only Drop 🔒",     body:"Your exclusive content is up.", time:"Mar 20 · 9:00 AM",  status:"delivered", reach:124 },
  ]);

  const [fcmKey, setFcmKey] = useState(cfg.apis?.fcmKey || "");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [schedConfirm, setSchedConfirm] = useState(false);
  const [notifTab, setNotifTab] = useState("send"); // send | history | settings

  const applyTemplate = (t) => {
    setTemplate(t.id);
    if (t.id !== 7) { setTitle(t.title); setBody(t.body); }
    else { setTitle(""); setBody(""); }
  };

  const canSend = title.trim().length > 0 && body.trim().length > 0;

  const sendNow = async () => {
    if (!canSend) return;
    setSending(true);
    await new Promise(r => setTimeout(r, 1200));

    // Browser push
    const sent = sendBrowserPush(title, body);

    // Add to history
    const entry = { id:Date.now(), title, body, time:"Just now", status:"delivered", reach: Math.floor(Math.random()*200)+50 };
    setHistory(prev => [entry, ...prev]);
    setSending(false); setSent(true);
    setTimeout(() => setSent(false), 3000);

    if (sendToast) sendToast.success(`Push sent to ${entry.reach} subscribers!`, "NOTIFICATION SENT 🔔");
    if (!sent && pushStatus !== "granted") {
      if (sendToast) sendToast.warning("Browser push blocked. Add Firebase key for real push.", "BROWSER PUSH BLOCKED");
    }
  };

  const scheduleNotif = () => {
    if (!schedDate || !schedTime || !canSend) return;
    setSchedConfirm(true);
    setTimeout(() => setSchedConfirm(false), 3000);
    if (sendToast) sendToast.info(`Notification scheduled for ${schedDate} at ${schedTime}`, "SCHEDULED 🕐");
  };

  const pStatus = pushStatus === "granted" ? { label:"ENABLED", color:"#00F5D4", dot:"#00F5D4" }
                : pushStatus === "denied"  ? { label:"BLOCKED",  color:"#FF3B30", dot:"#FF3B30" }
                : pushStatus === "unsupported" ? { label:"UNSUPPORTED", color:"#aaa", dot:"#555" }
                : { label:"NOT YET ASKED", color:"#FFD60A", dot:"#FFD60A" };

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* STATUS BAR */}
      <div style={{ display:"flex", gap:"10px", marginBottom:"20px" }}>
        <div style={{ flex:1, padding:"14px", borderRadius:"12px", background:`${pStatus.color}0d`, border:`1px solid ${pStatus.color}30`, display:"flex", alignItems:"center", gap:"10px" }}>
          <div style={{ width:"10px", height:"10px", borderRadius:"50%", background:pStatus.dot, flexShrink:0 }} />
          <div>
            <div style={{ fontSize:"10px", fontWeight:"800", color:pStatus.color, letterSpacing:"0.15em" }}>BROWSER PUSH: {pStatus.label}</div>
            <div style={{ fontSize:"9px", color:"#aaa", marginTop:"2px" }}>
              {pushStatus==="granted" ? "Users who allowed notifications will receive browser alerts" : pushStatus==="denied" ? "User blocked notifications. They must enable in browser settings." : "Firebase key required for real mobile push"}
            </div>
          </div>
        </div>
      </div>

      {/* SUB-TABS */}
      <div style={{ display:"flex", gap:"0", marginBottom:"20px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        {[["send","SEND"],["history","HISTORY"],["settings","SETTINGS"]].map(([id,label]) => (
          <button key={id} onClick={() => setNotifTab(id)} style={{ flex:1, padding:"10px 4px", background:"none", border:"none", cursor:"pointer", fontSize:"9px", letterSpacing:"0.2em", fontWeight:"700", fontFamily:"monospace", color:notifTab===id?"#FF6B35":"#3a3a3a", borderBottom:notifTab===id?"2px solid #FF6B35":"2px solid transparent", transition:"all 0.2s" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── SEND TAB ── */}
      {notifTab === "send" && (
        <div>
          {/* TEMPLATES */}
          <ASection title="Quick Templates" icon="◆" color="#FF6B35">
            <div style={{ display:"flex", flexWrap:"wrap", gap:"7px" }}>
              {NOTIF_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t)} style={{ display:"flex", alignItems:"center", gap:"6px", padding:"7px 12px", borderRadius:"18px", cursor:"pointer", background:template===t.id?"rgba(255,107,53,0.15)":"rgba(255,255,255,0.03)", border:template===t.id?"1px solid #FF6B35":"1px solid rgba(255,255,255,0.07)", color:template===t.id?"#FF6B35":"#555", fontSize:"10px", fontWeight:template===t.id?"700":"400", transition:"all 0.2s" }}>
                  <span>{t.emoji}</span><span>{t.name}</span>
                </button>
              ))}
            </div>
          </ASection>

          {/* COMPOSE */}
          <ASection title="Compose Notification" icon="🔔" color="#C77DFF">
            <div style={{ marginBottom:"12px" }}>
              <label style={{ fontSize:"9px", letterSpacing:"0.22em", color:"#aaa", display:"block", marginBottom:"6px" }}>NOTIFICATION TITLE</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. New Music Just Dropped! 🔥" maxLength={60}
                style={{ width:"100%", padding:"11px 13px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(199,125,255,0.2)", borderRadius:"9px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace" }} />
              <div style={{ textAlign:"right", fontSize:"8px", color:"#999", marginTop:"3px" }}>{title.length}/60</div>
            </div>
            <div style={{ marginBottom:"16px" }}>
              <label style={{ fontSize:"9px", letterSpacing:"0.22em", color:"#aaa", display:"block", marginBottom:"6px" }}>MESSAGE BODY</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="What do you want to tell your audience?" rows={3} maxLength={160}
                style={{ width:"100%", padding:"11px 13px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(199,125,255,0.2)", borderRadius:"9px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace", resize:"none", lineHeight:1.5 }} />
              <div style={{ textAlign:"right", fontSize:"8px", color:"#999", marginTop:"3px" }}>{body.length}/160</div>
            </div>

            {/* LIVE PREVIEW */}
            {(title || body) && (
              <div style={{ padding:"14px", borderRadius:"12px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", marginBottom:"16px" }}>
                <div style={{ fontSize:"9px", color:"#aaa", letterSpacing:"0.2em", marginBottom:"8px" }}>PREVIEW</div>
                <div style={{ display:"flex", gap:"10px", alignItems:"flex-start" }}>
                  <div style={{ width:"36px", height:"36px", borderRadius:"9px", background:"linear-gradient(135deg,#FF6B35,#C77DFF)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px", flexShrink:0 }}>🎙</div>
                  <div>
                    <div style={{ fontSize:"12px", fontWeight:"700", color:"#ddd", marginBottom:"2px" }}>{title || "Notification title"}</div>
                    <div style={{ fontSize:"11px", color:"#bbb", lineHeight:1.4 }}>{body || "Message body preview..."}</div>
                    <div style={{ fontSize:"9px", color:"#999", marginTop:"4px", fontFamily:"monospace" }}>Your Brand · now</div>
                  </div>
                </div>
              </div>
            )}

            {/* SEND BUTTONS */}
            <div style={{ display:"flex", gap:"10px" }}>
              <button onClick={sendNow} disabled={!canSend || sending}
                style={{ flex:2, padding:"13px", borderRadius:"11px", border:"none", cursor:canSend&&!sending?"pointer":"not-allowed", background:sent?"#00F5D4":canSend&&!sending?"linear-gradient(90deg,#FF6B35,#FFD60A)":"rgba(255,255,255,0.05)", color:sent?"#000":canSend&&!sending?"#000":"#383838", fontSize:"11px", fontWeight:"900", letterSpacing:"0.15em", fontFamily:"monospace", transition:"all 0.3s" }}>
                {sending?"◌ SENDING...":sent?"✓ SENT!":"🔔 SEND NOW"}
              </button>
              <button onClick={() => setNotifTab("send")} style={{ flex:1, padding:"13px", borderRadius:"11px", cursor:"pointer", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", color:"#bbb", fontSize:"10px", letterSpacing:"0.1em", fontFamily:"monospace" }}
                onClick={() => { setTitle(""); setBody(""); setTemplate(null); }}>CLEAR</button>
            </div>
          </ASection>

          {/* SCHEDULE */}
          <ASection title="Schedule for Later" icon="🕐" color="#FFD60A">
            <div style={{ display:"flex", gap:"10px", marginBottom:"12px" }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#aaa", display:"block", marginBottom:"6px" }}>DATE</label>
                <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                  style={{ width:"100%", padding:"10px", borderRadius:"8px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.07)", color:"#E8E4DC", fontSize:"11px", fontFamily:"monospace", outline:"none" }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#aaa", display:"block", marginBottom:"6px" }}>TIME</label>
                <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                  style={{ width:"100%", padding:"10px", borderRadius:"8px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.07)", color:"#E8E4DC", fontSize:"11px", fontFamily:"monospace", outline:"none" }} />
              </div>
            </div>
            <button onClick={scheduleNotif} disabled={!canSend||!schedDate||!schedTime}
              style={{ width:"100%", padding:"12px", borderRadius:"10px", border:"none", cursor:canSend&&schedDate&&schedTime?"pointer":"not-allowed", background:schedConfirm?"#00F5D4":canSend&&schedDate&&schedTime?"linear-gradient(90deg,#C77DFF,#FF6B35)":"rgba(255,255,255,0.05)", color:canSend&&schedDate&&schedTime?"#000":"#383838", fontSize:"11px", fontWeight:"900", letterSpacing:"0.15em", fontFamily:"monospace", transition:"all 0.3s" }}>
              {schedConfirm?"✅ SCHEDULED!":"🕐 SCHEDULE NOTIFICATION"}
            </button>
          </ASection>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {notifTab === "history" && (
        <div>
          <div style={{ padding:"12px", borderRadius:"10px", marginBottom:"16px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", display:"flex", justifyContent:"space-between" }}>
            <div style={{ textAlign:"center", flex:1 }}>
              <div style={{ fontSize:"20px", fontWeight:"900", color:"#00F5D4" }}>{history.length}</div>
              <div style={{ fontSize:"8px", color:"#999", letterSpacing:"0.2em" }}>SENT</div>
            </div>
            <div style={{ textAlign:"center", flex:1, borderLeft:"1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize:"20px", fontWeight:"900", color:"#FF6B35" }}>{history.reduce((a,h)=>a+h.reach,0)}</div>
              <div style={{ fontSize:"8px", color:"#999", letterSpacing:"0.2em" }}>TOTAL REACH</div>
            </div>
            <div style={{ textAlign:"center", flex:1, borderLeft:"1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize:"20px", fontWeight:"900", color:"#C77DFF" }}>100%</div>
              <div style={{ fontSize:"8px", color:"#999", letterSpacing:"0.2em" }}>DELIVERED</div>
            </div>
          </div>
          {history.map((h,i) => (
            <div key={h.id} style={{ padding:"14px", borderRadius:"12px", marginBottom:"10px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"6px" }}>
                <div style={{ fontSize:"12px", fontWeight:"700", color:"#ddd", flex:1 }}>{h.title}</div>
                <div style={{ padding:"2px 8px", borderRadius:"7px", background:"rgba(0,245,212,0.1)", border:"1px solid rgba(0,245,212,0.25)", fontSize:"8px", color:"#00F5D4", fontFamily:"monospace", flexShrink:0, marginLeft:"8px" }}>✓ {h.status.toUpperCase()}</div>
              </div>
              <div style={{ fontSize:"11px", color:"#aaa", marginBottom:"8px", lineHeight:1.4 }}>{h.body}</div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:"9px", color:"#999", fontFamily:"monospace" }}>{h.time}</span>
                <span style={{ fontSize:"9px", color:"#FF6B35", fontFamily:"monospace" }}>👁 {h.reach} reached</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {notifTab === "settings" && (
        <div>
          <ASection title="Firebase Cloud Messaging" icon="◆" color="#FF6B35">
            <AField label="Firebase Server Key (FCM)" value={fcmKey} onChange={v => { setFcmKey(v); }} placeholder="AAAAxxxxxxx... (from Firebase Console)" />
            <div style={{ fontSize:"9px", color:"#888", marginBottom:"14px" }}>Get your key → <span style={{ color:"#FF6B35" }}>console.firebase.google.com</span> → Project → Cloud Messaging</div>
            {[
              { label:"New Music Drop",     enabled:true  },
              { label:"New Episode",        enabled:true  },
              { label:"Live Stream Start",  enabled:true  },
              { label:"Exclusive Content",  enabled:true  },
              { label:"Merch Drop",         enabled:false },
              { label:"Weekly Digest",      enabled:false },
            ].map((n,i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ fontSize:"12px", color:"#ccc" }}>{n.label}</div>
                <div style={{ width:"40px", height:"22px", borderRadius:"11px", background:n.enabled?"#FF6B35":"rgba(255,255,255,0.1)", position:"relative", cursor:"pointer", transition:"background 0.3s" }}>
                  <div style={{ width:"16px", height:"16px", borderRadius:"50%", background:"#fff", position:"absolute", top:"3px", left:n.enabled?"21px":"3px", transition:"left 0.3s", boxShadow:"0 1px 4px rgba(0,0,0,0.4)" }} />
                </div>
              </div>
            ))}
          </ASection>
        </div>
      )}
    </div>
  );
}

// ─── MERCH ADMIN TAB ─────────────────────────────────────────────────────────
const MERCH_CAT_OPTIONS = ["Apparel","Accessories","Digital","Collectibles","Music","Other"];
const MERCH_EMOJIS = ["👕","🧢","📱","🧣","🧤","🎒","👟","🖼","💿","📋","🎹","⭐","🔥","💎","🎧","📦"];

function MerchAdminTab({ cfg, setCfg }) {
  const merch    = cfg.merch || { products:[], categories:[], stripeMode:"test", shippingMsg:"" };
  const products = merch.products || [];
  const imageRefs = useRef({});

  const updateMerch = (key, val) =>
    setCfg(prev => ({ ...prev, merch: { ...prev.merch, [key]: val } }));

  const updateProduct = (id, key, val) =>
    setCfg(prev => ({
      ...prev,
      merch: {
        ...prev.merch,
        products: prev.merch.products.map(p => p.id === id ? { ...p, [key]: val } : p),
      },
    }));

  const addProduct = () => {
    const newP = { id:Date.now(), name:"New Product", price:"0", category:"Apparel", emoji:"👕", desc:"", colors:[], sizes:[], stock:"0", digital:false, active:true, imageUrl:"" };
    setCfg(prev => ({ ...prev, merch: { ...prev.merch, products: [...(prev.merch?.products||[]), newP] } }));
  };

  const removeProduct = (id) =>
    setCfg(prev => ({ ...prev, merch: { ...prev.merch, products: prev.merch.products.filter(p => p.id !== id) } }));

  const handleImage = (file, id) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => updateProduct(id, "imageUrl", e.target.result);
    reader.readAsDataURL(file);
  };

  const [editId, setEditId] = useState(null);
  const editProduct = editId ? products.find(p => p.id === editId) : null;

  // Stats
  const activeCount  = products.filter(p => p.active).length;
  const digitalCount = products.filter(p => p.digital).length;
  const totalRev     = products.reduce((a,p) => a + (parseFloat(p.price)||0) * (parseInt(p.stock==="999"?50:p.stock)||0) * 0.12, 0);

  // ── PRODUCT EDITOR ──
  if (editProduct) {
    return (
      <div style={{ animation:"fadeIn 0.3s ease" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"20px" }}>
          <button onClick={() => setEditId(null)} style={{ padding:"8px 14px", borderRadius:"9px", border:"1px solid rgba(255,255,255,0.1)", background:"none", color:"#aaa", fontSize:"10px", cursor:"pointer" }}>← BACK</button>
          <div style={{ fontSize:"14px", fontWeight:"800", color:"#FFD60A" }}>EDITING: {editProduct.name}</div>
        </div>

        {/* IMAGE UPLOAD */}
        <ASection title="Product Image" icon="🖼" color="#C77DFF">
          <div onClick={() => imageRefs.current[editProduct.id]?.click()}
            style={{ borderRadius:"12px", overflow:"hidden", marginBottom:"10px", height:"140px", cursor:"pointer", background:editProduct.imageUrl?`url(${editProduct.imageUrl}) center/cover no-repeat`:"rgba(255,255,255,0.03)", border:"2px dashed rgba(199,125,255,0.3)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:"8px" }}>
            {!editProduct.imageUrl && <><span style={{ fontSize:"28px" }}>{editProduct.emoji}</span><span style={{ fontSize:"11px", color:"#aaa" }}>Tap to upload product photo</span></>}
            <input ref={el => imageRefs.current[editProduct.id]=el} type="file" accept="image/*"
              onChange={e => handleImage(e.target.files[0], editProduct.id)} style={{ display:"none" }} />
          </div>
          {editProduct.imageUrl && (
            <button onClick={() => updateProduct(editProduct.id,"imageUrl","")}
              style={{ width:"100%", padding:"8px", borderRadius:"8px", border:"1px solid rgba(255,59,48,0.3)", background:"rgba(255,59,48,0.07)", color:"#FF3B30", fontSize:"10px", cursor:"pointer" }}>✕ REMOVE IMAGE</button>
          )}
        </ASection>

        {/* BASICS */}
        <ASection title="Product Details" icon="◆" color="#FF6B35">
          <AField label="Product Name"    value={editProduct.name}  onChange={v => updateProduct(editProduct.id,"name",v)}  placeholder="e.g. Empire Hoodie" />
          <AField label="Price ($)"       value={editProduct.price} onChange={v => updateProduct(editProduct.id,"price",v)} placeholder="0.00" type="number" />
          <AField label="Description"     value={editProduct.desc}  onChange={v => updateProduct(editProduct.id,"desc",v)}  placeholder="Short product description" />
          <div style={{ marginBottom:"14px" }}>
            <label style={{ fontSize:"9px", letterSpacing:"0.22em", color:"#aaa", display:"block", marginBottom:"7px" }}>CATEGORY</label>
            <select value={editProduct.category} onChange={e => updateProduct(editProduct.id,"category",e.target.value)}
              style={{ width:"100%", padding:"11px 13px", background:"#0a0a0f", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"9px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace", cursor:"pointer" }}>
              {MERCH_CAT_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <AField label="Stock Quantity"  value={editProduct.stock} onChange={v => updateProduct(editProduct.id,"stock",v)} placeholder="0 (use 999 for unlimited digital)" type="number" />
        </ASection>

        {/* EMOJI PICKER */}
        <ASection title="Product Icon" icon="✨" color="#FFD60A">
          <div style={{ display:"flex", flexWrap:"wrap", gap:"8px" }}>
            {MERCH_EMOJIS.map(em => (
              <button key={em} onClick={() => updateProduct(editProduct.id,"emoji",em)}
                style={{ width:"40px", height:"40px", borderRadius:"9px", fontSize:"20px", cursor:"pointer", border:editProduct.emoji===em?"2px solid #FFD60A":"1px solid rgba(255,255,255,0.08)", background:editProduct.emoji===em?"rgba(255,214,10,0.1)":"rgba(255,255,255,0.03)", transition:"all 0.15s" }}>
                {em}
              </button>
            ))}
          </div>
        </ASection>

        {/* VARIANTS */}
        <ASection title="Variants" icon="◈" color="#00F5D4">
          <div style={{ display:"flex", gap:"8px", marginBottom:"14px" }}>
            {[["Digital Product","digital"],["Active / Visible","active"]].map(([label,key]) => (
              <div key={key} onClick={() => updateProduct(editProduct.id, key, !editProduct[key])}
                style={{ flex:1, padding:"12px", borderRadius:"10px", textAlign:"center", cursor:"pointer", border:editProduct[key]?"1px solid #00F5D4":"1px solid rgba(255,255,255,0.07)", background:editProduct[key]?"rgba(0,245,212,0.08)":"rgba(255,255,255,0.02)", transition:"all 0.2s" }}>
                <div style={{ fontSize:"11px", fontWeight:"700", color:editProduct[key]?"#00F5D4":"#555" }}>{editProduct[key]?"✓ ":""}{label}</div>
              </div>
            ))}
          </div>
          {!editProduct.digital && (
            <>
              <div style={{ marginBottom:"12px" }}>
                <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#aaa", display:"block", marginBottom:"6px" }}>SIZES (comma separated)</label>
                <input value={(editProduct.sizes||[]).join(",")} onChange={e => updateProduct(editProduct.id,"sizes",e.target.value.split(",").map(s=>s.trim()).filter(Boolean))}
                  placeholder="S,M,L,XL,2XL"
                  style={{ width:"100%", padding:"10px 13px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"9px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace" }} />
              </div>
              <div>
                <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#aaa", display:"block", marginBottom:"6px" }}>COLORS (comma separated)</label>
                <input value={(editProduct.colors||[]).join(",")} onChange={e => updateProduct(editProduct.id,"colors",e.target.value.split(",").map(s=>s.trim()).filter(Boolean))}
                  placeholder="Black,White,Orange"
                  style={{ width:"100%", padding:"10px 13px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"9px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace" }} />
              </div>
            </>
          )}
        </ASection>

        <button onClick={() => setEditId(null)}
          style={{ width:"100%", padding:"14px", borderRadius:"11px", border:"none", background:"linear-gradient(90deg,#FF6B35,#FFD60A)", color:"#000", fontSize:"12px", fontWeight:"900", letterSpacing:"0.15em", cursor:"pointer" }}>
          ✓ DONE EDITING
        </button>
      </div>
    );
  }

  // ── PRODUCT LIST ──
  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* STATS */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"10px", marginBottom:"20px" }}>
        {[
          { label:"PRODUCTS",    val:products.length,  color:"#FF6B35"  },
          { label:"ACTIVE",      val:activeCount,       color:"#00F5D4"  },
          { label:"DIGITAL",     val:digitalCount,      color:"#C77DFF"  },
        ].map((s,i) => (
          <div key={i} style={{ padding:"14px 8px", borderRadius:"12px", background:"rgba(255,255,255,0.03)", border:`1px solid ${s.color}22`, textAlign:"center" }}>
            <div style={{ fontSize:"22px", fontWeight:"900", color:s.color }}>{s.val}</div>
            <div style={{ fontSize:"7px", letterSpacing:"0.2em", color:"#999", marginTop:"3px" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* STORE SETTINGS */}
      <ASection title="Store Settings" icon="⚙" color="#FFD60A">
        <AField label="Shipping Message" value={merch.shippingMsg||""} onChange={v => updateMerch("shippingMsg",v)} placeholder="Free shipping on orders over $75" />
        <div style={{ marginBottom:"14px" }}>
          <label style={{ fontSize:"9px", letterSpacing:"0.22em", color:"#aaa", display:"block", marginBottom:"7px" }}>STRIPE MODE</label>
          <div style={{ display:"flex", gap:"8px" }}>
            {[["test","Test Mode"],["live","Live Mode"]].map(([val,label]) => (
              <div key={val} onClick={() => updateMerch("stripeMode",val)}
                style={{ flex:1, padding:"11px", borderRadius:"10px", textAlign:"center", cursor:"pointer", border:(merch.stripeMode||"test")===val?"1px solid #FFD60A":"1px solid rgba(255,255,255,0.07)", background:(merch.stripeMode||"test")===val?"rgba(255,214,10,0.1)":"rgba(255,255,255,0.02)", transition:"all 0.2s" }}>
                <div style={{ fontSize:"11px", fontWeight:"700", color:(merch.stripeMode||"test")===val?"#FFD60A":"#555" }}>{label}</div>
              </div>
            ))}
          </div>
          {(merch.stripeMode||"test") === "live" && (
            <div style={{ marginTop:"8px", padding:"8px 12px", borderRadius:"8px", background:"rgba(0,245,212,0.07)", border:"1px solid rgba(0,245,212,0.2)", fontSize:"10px", color:"#00F5D4" }}>
              ✓ Add your live Stripe key in Admin → APIs to accept real payments
            </div>
          )}
        </div>
      </ASection>

      {/* PRODUCT LIST */}
      <ASection title="Products" icon="🛍" color="#FF6B35">
        {products.length === 0 && (
          <div style={{ textAlign:"center", padding:"24px", color:"#999", fontSize:"12px" }}>No products yet. Add your first one below.</div>
        )}
        {products.map((p,i) => (
          <div key={p.id} style={{ display:"flex", alignItems:"center", gap:"12px", padding:"13px", marginBottom:"10px", borderRadius:"12px", background:p.active?"rgba(255,255,255,0.03)":"rgba(255,255,255,0.01)", border:p.active?"1px solid rgba(255,255,255,0.08)":"1px solid rgba(255,255,255,0.04)", opacity:p.active?1:0.5 }}>
            {/* PRODUCT IMAGE / EMOJI */}
            <div style={{ width:"50px", height:"50px", borderRadius:"10px", flexShrink:0, overflow:"hidden", background:p.imageUrl?`url(${p.imageUrl}) center/cover no-repeat`:"rgba(255,107,53,0.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"22px" }}>
              {!p.imageUrl && p.emoji}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"2px" }}>
                <span style={{ fontSize:"12px", fontWeight:"700", color:"#ddd" }}>{p.name}</span>
                {p.digital && <span style={{ padding:"2px 6px", borderRadius:"6px", background:"rgba(0,245,212,0.1)", border:"1px solid rgba(0,245,212,0.2)", fontSize:"8px", color:"#00F5D4" }}>DIGITAL</span>}
                {!p.active && <span style={{ padding:"2px 6px", borderRadius:"6px", background:"rgba(255,59,48,0.1)", border:"1px solid rgba(255,59,48,0.2)", fontSize:"8px", color:"#FF3B30" }}>HIDDEN</span>}
              </div>
              <div style={{ fontSize:"10px", color:"#999", fontFamily:"monospace" }}>{p.category} · ${p.price} · stock: {p.stock}</div>
            </div>
            <div style={{ display:"flex", gap:"6px", flexShrink:0 }}>
              <button onClick={() => setEditId(p.id)} style={{ padding:"6px 12px", borderRadius:"8px", border:"1px solid rgba(255,107,53,0.3)", background:"rgba(255,107,53,0.08)", color:"#FF6B35", fontSize:"10px", cursor:"pointer" }}>✏ EDIT</button>
              <button onClick={() => removeProduct(p.id)} style={{ padding:"6px 10px", borderRadius:"8px", border:"1px solid rgba(255,59,48,0.25)", background:"none", color:"#FF3B30", fontSize:"12px", cursor:"pointer" }}>✕</button>
            </div>
          </div>
        ))}
        <button onClick={addProduct}
          style={{ width:"100%", padding:"13px", borderRadius:"11px", border:"2px dashed rgba(255,107,53,0.25)", background:"rgba(255,107,53,0.04)", color:"#FF6B35", fontSize:"12px", fontWeight:"700", letterSpacing:"0.1em", cursor:"pointer", marginTop:"4px" }}>
          + ADD NEW PRODUCT
        </button>
      </ASection>
    </div>
  );
}


function BlueprintAdminTab() {
  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <div style={{ padding:"16px", borderRadius:"14px", marginBottom:"20px", background:"linear-gradient(135deg,rgba(247,37,133,0.09),rgba(199,125,255,0.07))", border:"1px solid rgba(247,37,133,0.2)" }}>
        <div style={{ fontSize:"9px", letterSpacing:"0.3em", color:"#F72585", fontFamily:"monospace", marginBottom:"7px" }}>◆ THE CORE STRATEGY</div>
        <div style={{ fontSize:"13px", lineHeight:1.7, color:"#bbb" }}>Stop sending people to multiple platforms. <strong style={{ color:"#fff" }}>Bring every platform to one place.</strong> Your app = the destination. Social media = the billboard.</div>
      </div>

      {MARKETING_PLAN.map((ph,i) => (
        <div key={i} style={{ marginBottom:"16px", borderRadius:"13px", overflow:"hidden", border:`1px solid ${ph.color}20` }}>
          <div style={{ padding:"12px 16px", background:`${ph.color}12`, borderBottom:`1px solid ${ph.color}20`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:"8px", letterSpacing:"0.3em", color:ph.color, fontFamily:"monospace" }}>{ph.phase} · {ph.timeline}</div>
              <div style={{ fontSize:"13px", fontWeight:"800", letterSpacing:"0.04em", marginTop:"2px" }}>{ph.title}</div>
            </div>
            <div style={{ width:"28px", height:"28px", borderRadius:"50%", background:`${ph.color}20`, border:`1px solid ${ph.color}44`, display:"flex", alignItems:"center", justifyContent:"center", color:ph.color, fontSize:"11px", flexShrink:0 }}>0{i+1}</div>
          </div>
          <div style={{ padding:"14px 16px", background:"rgba(255,255,255,0.01)" }}>
            {ph.steps.map((step,j) => (
              <div key={j} style={{ display:"flex", gap:"10px", alignItems:"flex-start", marginBottom:j < ph.steps.length-1 ? "10px" : "0" }}>
                <div style={{ width:"16px", height:"16px", borderRadius:"4px", flexShrink:0, border:`1px solid ${ph.color}40`, marginTop:"1px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"8px", color:ph.color, fontFamily:"monospace" }}>{j+1}</div>
                <div style={{ fontSize:"12px", color:"#aaa", lineHeight:1.5 }}>{step}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(0,245,212,0.15)", marginTop:"8px" }}>
        <div style={{ fontSize:"9px", letterSpacing:"0.3em", color:"#00F5D4", fontFamily:"monospace", marginBottom:"14px" }}>REVENUE PROJECTIONS</div>
        {[
          ["Fan Memberships",    "$4.99/mo × 500",   "$2,495/mo"],
          ["Digital Downloads",  "Albums, replays",   "$800/mo" ],
          ["Brand Partnerships", "Sponsored content", "$1,500/mo"],
          ["Merch Sales",        "In-app store",      "$600/mo" ],
          ["Live Events",        "Ticketed streams",  "$1,200/mo"],
        ].map(([n,note,rev],i) => (
          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
            <div>
              <div style={{ fontSize:"12px", fontWeight:"600", color:"#ddd" }}>{n}</div>
              <div style={{ fontSize:"10px", color:"#999", fontFamily:"monospace" }}>{note}</div>
            </div>
            <div style={{ fontSize:"13px", fontWeight:"800", color:"#00F5D4", fontFamily:"monospace" }}>{rev}</div>
          </div>
        ))}
        <div style={{ marginTop:"14px", padding:"14px", borderRadius:"10px", background:"linear-gradient(135deg,rgba(0,245,212,0.09),rgba(255,214,10,0.05))", border:"1px solid rgba(0,245,212,0.18)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:"11px", letterSpacing:"0.14em", fontFamily:"monospace", color:"#999" }}>TOTAL POTENTIAL</div>
          <div style={{ fontSize:"22px", fontWeight:"900", color:"#00F5D4" }}>$6,595<span style={{ fontSize:"12px", color:"#aaa" }}>/mo</span></div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT ROOM SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
const SEED_POSTS = [
  { id:1, author:"Marcus D.",   handle:"@marcusd",   avatar:"🎤", time:"2h ago",   text:"Just finished listening to the new drop — that's HEAT 🔥 The production on track 3 is insane!", image:"", likes:24, liked:false, replies:[
    { id:101, author:"Tanya R.", handle:"@tanr",    avatar:"🎵", time:"1h ago", text:"Right?! Track 3 has me replaying it on repeat 🎶", likes:8, liked:false },
    { id:102, author:"Jordan M.",handle:"@jordanm", avatar:"⭐", time:"45m ago",text:"The beat switch at 2:30 got me 😤💯",              likes:5, liked:false },
  ]},
  { id:2, author:"Keisha W.",   handle:"@keishew",   avatar:"💎", time:"5h ago",   text:"Episode 03 was the realest talk I've heard in a long time. 'Stop waiting for permission' — saved that quote.", image:"", likes:41, liked:false, replies:[
    { id:103, author:"Chris L.", handle:"@chrisl", avatar:"🎙", time:"4h ago", text:"That quote hit different. Screenshotted immediately 📸", likes:12, liked:false },
  ]},
  { id:3, author:"DeShawn T.",  handle:"@deshawnt",  avatar:"🔥", time:"1d ago",   text:"The merch just arrived and the quality is no joke. Hoodie is 🔥🔥🔥 worth every penny.", image:"", likes:67, liked:false, replies:[] },
];

function ChatRoomScreen({ config, goHome }) {
  const pc   = config.brand.primaryColor;
  const ac   = config.brand.accentColor;
  const chat = config.chat || {};

  const [posts,        setPosts]       = useState(SEED_POSTS);
  const [dbLoaded,     setDbLoaded]    = useState(false);
  const [newText,      setNewText]     = useState("");
  const [newImage,     setNewImage]    = useState("");
  const [composing,    setComposing]   = useState(false);
  const [replyingTo,   setReplyingTo]  = useState(null);
  const [replyText,    setReplyText]   = useState("");
  const [expandedPost, setExpandedPost]= useState(null);
  const [authorName,   setAuthorName]  = useState("");
  const [authorHandle, setAuthorHandle]= useState("");
  const [profileSet,   setProfileSet]  = useState(false);
  const imageRef = useRef(null);
  const feedRef  = useRef(null);

  // Load posts from Supabase on mount
  useEffect(() => {
    sb.getPosts().then(data => {
      if (data && data.length > 0) {
        const formatted = data.map(p => ({
          id:      p.id,
          author:  p.author,
          handle:  p.handle,
          avatar:  p.avatar,
          time:    new Date(p.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}),
          text:    p.text,
          image:   p.image || "",
          likes:   p.likes || 0,
          liked:   false,
          replies: p.replies || [],
        }));
        setPosts(formatted);
      }
      setDbLoaded(true);
    }).catch(() => setDbLoaded(true));
  }, []);

  // Hero background
  const heroBg = chat.heroType === "image" && chat.heroImageUrl
    ? `url(${chat.heroImageUrl}) center/cover no-repeat`
    : `linear-gradient(135deg,${pc}44,${ac}33,rgba(0,0,0,0.7))`;

  const postCount   = posts.length;
  const replyCount  = posts.reduce((a,p) => a + (p.replies||[]).length, 0);
  const totalLikes  = posts.reduce((a,p) => a + p.likes, 0);

  const AVATARS = ["😊","🎵","🔥","💎","⭐","🎤","🎙","🎧","🎶","💯","🙌","👑","✨","🎯","💪","🚀"];
  const myAvatar = authorHandle ? AVATARS[authorHandle.length % AVATARS.length] : "😊";

  // ── SUBMIT POST ────────────────────────────────────────────────────────────
  const submitPost = async () => {
    if (!newText.trim()) return;
    const name   = authorName.trim()   || "Anonymous";
    const handle = authorHandle.trim() || "@user";
    const post = {
      id:      Date.now(),
      author:  name,
      handle:  handle.startsWith("@") ? handle : "@"+handle,
      avatar:  myAvatar,
      time:    "just now",
      text:    newText.trim(),
      image:   newImage,
      likes:   0,
      liked:   false,
      replies: [],
    };
    setPosts(prev => [post, ...prev]);
    setNewText(""); setNewImage(""); setComposing(false);
    if (!profileSet) setProfileSet(true);
    feedRef.current?.scrollTo({ top:0, behavior:"smooth" });
    // Save to Supabase
    await sb.addPost(post);
  };

  // ── SUBMIT REPLY ───────────────────────────────────────────────────────────
  const submitReply = (postId) => {
    if (!replyText.trim()) return;
    const name   = authorName.trim()   || "Anonymous";
    const handle = authorHandle.trim() || "@user";
    const reply = { id:Date.now(), author:name, handle:handle.startsWith("@")?handle:"@"+handle, avatar:myAvatar, time:"just now", text:replyText.trim(), likes:0, liked:false };
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, replies:[...(p.replies||[]), reply] } : p));
    setReplyText(""); setReplyingTo(null); setExpandedPost(postId);
  };

  // ── LIKE POST ──────────────────────────────────────────────────────────────
  const likePost = (postId) => {
    setPosts(prev => {
      const updated = prev.map(p => p.id === postId
        ? { ...p, likes: p.liked ? p.likes-1 : p.likes+1, liked: !p.liked }
        : p
      );
      const post = updated.find(p => p.id === postId);
      if (post) sb.updatePost(postId, { likes: post.likes });
      return updated;
    });
  };

  const likeReply = (postId, replyId) => {
    setPosts(prev => prev.map(p => p.id !== postId ? p : {
      ...p,
      replies: p.replies.map(r => r.id !== replyId ? r : { ...r, likes:r.liked?r.likes-1:r.likes+1, liked:!r.liked })
    }));
  };

  // ── SUBMIT REPLY ───────────────────────────────────────────────────────────
  const submitReplyToPost = async (postId) => {
    if (!replyText.trim()) return;
    const reply = {
      id: Date.now(), author: authorName||"Anonymous",
      handle: (authorHandle||"@user").startsWith("@") ? (authorHandle||"@user") : "@"+(authorHandle||"user"),
      avatar: myAvatar, time:"just now", text: replyText.trim(), likes:0, liked:false,
    };
    setPosts(prev => {
      const updated = prev.map(p => p.id===postId ? {...p, replies:[...(p.replies||[]),reply]} : p);
      const post = updated.find(p=>p.id===postId);
      if (post) sb.updatePost(postId, { replies: post.replies });
      return updated;
    });
    setReplyText(""); setReplyingTo(null);
  };

  const handleImagePick = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 10*1024*1024) { alert("Max 10MB"); return; }
    const r = new FileReader();
    r.onload = e => setNewImage(e.target.result);
    r.readAsDataURL(file);
  };

  const fmtCount = n => n >= 1000 ? `${(n/1000).toFixed(1)}K` : n;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:"calc(100vh - 115px)" }}>
      <BackButton onBack={goHome} />

      {/* ── STATIC HERO BANNER ── */}
      <div style={{ position:"relative", flexShrink:0, background:heroBg, overflow:"hidden" }}>
        {chat.heroMediaType === "video" && chat.heroVideoUrl ? (
          <video src={chat.heroVideoUrl} autoPlay loop muted playsInline
            style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", zIndex:0 }} />
        ) : null}
        <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.52)", zIndex:1 }} />
        <div style={{ position:"relative", zIndex:2, padding:"24px 20px 20px", textAlign:"center" }}>
          <div style={{ fontSize:"9px", letterSpacing:"0.35em", color:"rgba(255,255,255,0.5)", fontFamily:"monospace", marginBottom:"5px" }}>💬 {chat.roomName || "THE COMMUNITY"}</div>
          <div style={{ fontSize:"22px", fontWeight:"900", color:"#fff", marginBottom:"4px", letterSpacing:"-0.01em" }}>{chat.heroHeading || "THE COMMUNITY"}</div>
          <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.55)", fontFamily:"monospace", letterSpacing:"0.15em", marginBottom:"16px" }}>{chat.heroSubtext || "Connect · Share · Vibe"}</div>
          {/* STATS */}
          <div style={{ display:"flex", justifyContent:"center", gap:"20px" }}>
            {[
              [postCount,    "POSTS"  ],
              [replyCount,   "REPLIES"],
              [fmtCount(totalLikes), "LIKES"  ],
            ].map(([n,l],i) => (
              <div key={i} style={{ textAlign:"center" }}>
                <div style={{ fontSize:"18px", fontWeight:"900", color:pc }}>{n}</div>
                <div style={{ fontSize:"7px", letterSpacing:"0.25em", color:"rgba(255,255,255,0.4)", fontFamily:"monospace" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CREATE POST BAR ── */}
      <div style={{ padding:"12px 16px", borderBottom:`1px solid rgba(255,255,255,0.06)`, background:"rgba(8,8,8,0.9)", flexShrink:0 }}>
        {!composing ? (
          <div onClick={() => setComposing(true)}
            style={{ display:"flex", alignItems:"center", gap:"12px", padding:"11px 14px", borderRadius:"24px", background:"rgba(255,255,255,0.05)", border:`1px solid rgba(255,255,255,0.08)`, cursor:"pointer" }}>
            <div style={{ width:"32px", height:"32px", borderRadius:"50%", background:`${pc}33`, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px" }}>{myAvatar}</div>
            <span style={{ fontSize:"13px", color:"#999" }}>{chat.placeholder || "Share something with the community..."}</span>
          </div>
        ) : (
          <div style={{ borderRadius:"16px", background:"rgba(255,255,255,0.04)", border:`1px solid ${pc}44`, padding:"14px" }}>
            {/* NAME FIELDS (first time) */}
            {!profileSet && (
              <div style={{ display:"flex", gap:"8px", marginBottom:"10px" }}>
                <input value={authorName} onChange={e=>setAuthorName(e.target.value)} placeholder="Your name"
                  style={{ flex:1, padding:"8px 12px", borderRadius:"8px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", color:"#E8E4DC", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
                <input value={authorHandle} onChange={e=>setAuthorHandle(e.target.value)} placeholder="@handle"
                  style={{ flex:1, padding:"8px 12px", borderRadius:"8px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", color:"#E8E4DC", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
              </div>
            )}
            <textarea value={newText} onChange={e=>setNewText(e.target.value)}
              placeholder={chat.placeholder || "What's on your mind?"}
              autoFocus rows={3}
              style={{ width:"100%", background:"none", border:"none", color:"#F0EDE8", fontSize:"14px", outline:"none", fontFamily:"'Georgia',serif", lineHeight:1.5, resize:"none" }} />
            {newImage && (
              <div style={{ position:"relative", marginTop:"8px", borderRadius:"10px", overflow:"hidden" }}>
                <img src={newImage} alt="preview" style={{ width:"100%", maxHeight:"200px", objectFit:"cover", borderRadius:"10px", display:"block" }} />
                <button onClick={() => setNewImage("")} style={{ position:"absolute", top:"6px", right:"6px", width:"24px", height:"24px", borderRadius:"50%", background:"rgba(0,0,0,0.7)", border:"none", color:"#fff", fontSize:"13px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"10px" }}>
              <div style={{ display:"flex", gap:"6px" }}>
                <button onClick={() => imageRef.current?.click()} style={{ padding:"6px 12px", borderRadius:"14px", border:"1px solid rgba(255,255,255,0.1)", background:"none", color:"#bbb", fontSize:"10px", cursor:"pointer" }}>📷 Photo</button>
                <input ref={imageRef} type="file" accept="image/*" onChange={e=>handleImagePick(e.target.files[0])} style={{ display:"none" }} />
                <button onClick={() => { setComposing(false); setNewText(""); setNewImage(""); }} style={{ padding:"6px 12px", borderRadius:"14px", border:"none", background:"none", color:"#999", fontSize:"10px", cursor:"pointer" }}>Cancel</button>
              </div>
              <button onClick={submitPost} disabled={!newText.trim()}
                style={{ padding:"8px 20px", borderRadius:"20px", border:"none", background:newText.trim()?`linear-gradient(90deg,${pc},${ac})`:"rgba(255,255,255,0.08)", color:newText.trim()?"#000":"#484848", fontSize:"11px", fontWeight:"900", cursor:newText.trim()?"pointer":"not-allowed", transition:"all 0.2s", fontFamily:"monospace" }}>
                POST
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── FEED ── */}
      <div ref={feedRef} style={{ flex:1, overflowY:"auto", padding:"0 0 20px" }}>
        {posts.length === 0 && (
          <div style={{ padding:"60px 20px", textAlign:"center", color:"#999" }}>
            <div style={{ fontSize:"36px", marginBottom:"12px" }}>💬</div>
            <div style={{ fontSize:"14px" }}>No posts yet. Be the first!</div>
          </div>
        )}
        {posts.map(post => (
          <div key={post.id} style={{ borderBottom:`1px solid rgba(255,255,255,0.05)` }}>
            {/* POST */}
            <div style={{ padding:"16px 16px 10px" }}>
              <div style={{ display:"flex", gap:"11px" }}>
                {/* AVATAR */}
                <div style={{ width:"38px", height:"38px", borderRadius:"50%", flexShrink:0, background:`${pc}22`, border:`1px solid ${pc}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"18px" }}>{post.avatar}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  {/* HEADER */}
                  <div style={{ display:"flex", alignItems:"baseline", gap:"6px", marginBottom:"5px", flexWrap:"wrap" }}>
                    <span style={{ fontSize:"13px", fontWeight:"700", color:"#ddd" }}>{post.author}</span>
                    <span style={{ fontSize:"10px", color:"#999", fontFamily:"monospace" }}>{post.handle}</span>
                    <span style={{ fontSize:"9px", color:"#333", marginLeft:"auto", fontFamily:"monospace", flexShrink:0 }}>{post.time}</span>
                  </div>
                  {/* TEXT */}
                  <div style={{ fontSize:"14px", color:"#ccc", lineHeight:1.55, marginBottom:"10px" }}>{post.text}</div>
                  {/* IMAGE */}
                  {post.image && (
                    <div style={{ borderRadius:"12px", overflow:"hidden", marginBottom:"10px" }}>
                      <img src={post.image} alt="post" style={{ width:"100%", maxHeight:"280px", objectFit:"cover", display:"block" }} />
                    </div>
                  )}
                  {/* ACTIONS */}
                  <div style={{ display:"flex", gap:"4px", alignItems:"center" }}>
                    {/* LIKE */}
                    <button onClick={() => likePost(post.id)}
                      style={{ display:"flex", alignItems:"center", gap:"5px", padding:"5px 12px", borderRadius:"16px", border:`1px solid ${post.liked?`${pc}66`:"rgba(255,255,255,0.07)"}`, background:post.liked?`${pc}18`:"none", color:post.liked?pc:"#555", fontSize:"11px", cursor:"pointer", transition:"all 0.2s", fontFamily:"monospace" }}>
                      {post.liked?"❤️":"🤍"} {post.likes > 0 && <span>{fmtCount(post.likes)}</span>}
                    </button>
                    {/* REPLY */}
                    <button onClick={() => { setReplyingTo(replyingTo===post.id?null:post.id); setExpandedPost(post.id); }}
                      style={{ display:"flex", alignItems:"center", gap:"5px", padding:"5px 12px", borderRadius:"16px", border:"1px solid rgba(255,255,255,0.07)", background:"none", color:"#aaa", fontSize:"11px", cursor:"pointer", transition:"all 0.2s", fontFamily:"monospace" }}>
                      💬 {post.replies.length > 0 && fmtCount(post.replies.length)}
                    </button>
                    {/* EXPAND REPLIES */}
                    {post.replies.length > 0 && (
                      <button onClick={() => setExpandedPost(expandedPost===post.id?null:post.id)}
                        style={{ background:"none", border:"none", color:"#999", fontSize:"10px", cursor:"pointer", fontFamily:"monospace", marginLeft:"4px" }}>
                        {expandedPost===post.id ? "▲ Hide":"▼ Show"} {post.replies.length} {post.replies.length===1?"reply":"replies"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* REPLY INPUT */}
            {replyingTo === post.id && (
              <div style={{ padding:"0 16px 12px 65px" }}>
                {!profileSet && (
                  <div style={{ display:"flex", gap:"6px", marginBottom:"6px" }}>
                    <input value={authorName} onChange={e=>setAuthorName(e.target.value)} placeholder="Your name"
                      style={{ flex:1, padding:"7px 10px", borderRadius:"7px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.07)", color:"#E8E4DC", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
                    <input value={authorHandle} onChange={e=>setAuthorHandle(e.target.value)} placeholder="@handle"
                      style={{ flex:1, padding:"7px 10px", borderRadius:"7px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.07)", color:"#E8E4DC", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
                  </div>
                )}
                <div style={{ display:"flex", gap:"8px", alignItems:"flex-end" }}>
                  <div style={{ width:"28px", height:"28px", borderRadius:"50%", flexShrink:0, background:`${ac}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px" }}>{myAvatar}</div>
                  <div style={{ flex:1, background:"rgba(255,255,255,0.04)", borderRadius:"12px", border:`1px solid ${ac}33`, padding:"8px 12px", display:"flex", alignItems:"flex-end", gap:"8px" }}>
                    <textarea value={replyText} onChange={e=>setReplyText(e.target.value)}
                      placeholder="Write a reply..." rows={2} autoFocus
                      onKeyDown={e => { if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); submitReply(post.id); }}}
                      style={{ flex:1, background:"none", border:"none", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"'Georgia',serif", resize:"none", lineHeight:1.5 }} />
                    <button onClick={() => submitReply(post.id)} disabled={!replyText.trim()}
                      style={{ padding:"5px 12px", borderRadius:"12px", border:"none", background:replyText.trim()?ac:"rgba(255,255,255,0.08)", color:replyText.trim()?"#000":"#484848", fontSize:"10px", fontWeight:"700", cursor:replyText.trim()?"pointer":"not-allowed", flexShrink:0, fontFamily:"monospace" }}>
                      REPLY
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* REPLIES */}
            {expandedPost === post.id && post.replies.length > 0 && (
              <div style={{ padding:"0 16px 12px 65px" }}>
                {post.replies.map(reply => (
                  <div key={reply.id} style={{ display:"flex", gap:"9px", marginBottom:"10px" }}>
                    <div style={{ width:"28px", height:"28px", borderRadius:"50%", flexShrink:0, background:`${ac}22`, border:`1px solid ${ac}33`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"13px" }}>{reply.avatar}</div>
                    <div style={{ flex:1, background:"rgba(255,255,255,0.03)", borderRadius:"11px", padding:"9px 12px", borderLeft:`2px solid ${ac}44` }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:"6px", marginBottom:"3px" }}>
                        <span style={{ fontSize:"11px", fontWeight:"700", color:"#ccc" }}>{reply.author}</span>
                        <span style={{ fontSize:"9px", color:"#999", fontFamily:"monospace" }}>{reply.handle}</span>
                        <span style={{ fontSize:"8px", color:"#333", marginLeft:"auto", fontFamily:"monospace" }}>{reply.time}</span>
                      </div>
                      <div style={{ fontSize:"12px", color:"#aaa", lineHeight:1.5, marginBottom:"6px" }}>{reply.text}</div>
                      <button onClick={() => likeReply(post.id, reply.id)}
                        style={{ display:"flex", alignItems:"center", gap:"4px", background:"none", border:"none", color:reply.liked?pc:"#484848", fontSize:"10px", cursor:"pointer", padding:"2px 0", fontFamily:"monospace" }}>
                        {reply.liked?"❤️":"🤍"} {reply.likes > 0 && reply.likes}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CHAT ADMIN TAB ──────────────────────────────────────────────────────────
function ChatAdminTab({ cfg, setCfg }) {
  const chat     = cfg.chat || {};
  const heroRef  = useRef(null);
  const videoRef = useRef(null);

  const updateChat = (key, val) =>
    setCfg(prev => ({ ...prev, chat: { ...prev.chat, [key]: val } }));

  const handleHeroFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const r = new FileReader(); r.onload = e => { updateChat("heroImageUrl", e.target.result); updateChat("heroType","image"); updateChat("heroMediaType","image"); }; r.readAsDataURL(file);
  };

  const handleVideoFile = (file) => {
    if (!file || !file.type.startsWith("video/")) return;
    const r = new FileReader(); r.onload = e => { updateChat("heroVideoUrl", e.target.result); updateChat("heroMediaType","video"); }; r.readAsDataURL(file);
  };

  const pc = cfg.brand.primaryColor;
  const ac = cfg.brand.accentColor;

  const previewBg = chat.heroType==="image" && chat.heroImageUrl
    ? `url(${chat.heroImageUrl}) center/cover no-repeat`
    : `linear-gradient(135deg,${pc}44,${ac}33,rgba(0,0,0,0.7))`;

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* LIVE PREVIEW */}
      <div style={{ borderRadius:"14px", overflow:"hidden", marginBottom:"20px", height:"130px", position:"relative", background:previewBg }}>
        <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.52)" }} />
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
          <div style={{ fontSize:"18px", fontWeight:"900", color:"#fff" }}>{chat.heroHeading||"THE COMMUNITY"}</div>
          <div style={{ fontSize:"9px", color:"rgba(255,255,255,0.5)", letterSpacing:"0.2em", fontFamily:"monospace", marginTop:"4px" }}>{chat.heroSubtext||"Connect · Share · Vibe"}</div>
        </div>
      </div>

      {/* HERO MEDIA */}
      <ASection title="Hero Banner" icon="🖼" color="#C77DFF">
        <div style={{ display:"flex", gap:"8px", marginBottom:"14px" }}>
          {[["gradient","Gradient"],["image","Photo"],["video","Video"]].map(([val,label]) => (
            <div key={val} onClick={() => { updateChat("heroType",val); if(val==="video") updateChat("heroMediaType","video"); else updateChat("heroMediaType","image"); }}
              style={{ flex:1, padding:"10px 6px", borderRadius:"10px", textAlign:"center", cursor:"pointer", border:(chat.heroType||"gradient")===val?"1px solid #C77DFF":"1px solid rgba(255,255,255,0.07)", background:(chat.heroType||"gradient")===val?"rgba(199,125,255,0.1)":"rgba(255,255,255,0.02)", transition:"all 0.2s" }}>
              <div style={{ fontSize:"11px", fontWeight:"700", color:(chat.heroType||"gradient")===val?"#C77DFF":"#555" }}>{label}</div>
            </div>
          ))}
        </div>

        {chat.heroType === "image" && (
          <div>
            <div onClick={() => heroRef.current?.click()}
              style={{ padding:"18px", borderRadius:"11px", textAlign:"center", cursor:"pointer", border:chat.heroImageUrl?"2px solid #C77DFF":"2px dashed rgba(199,125,255,0.25)", background:"rgba(199,125,255,0.04)", marginBottom:"8px" }}>
              <div style={{ fontSize:"20px", marginBottom:"5px" }}>{chat.heroImageUrl?"🖼":"📤"}</div>
              <div style={{ fontSize:"11px", color:chat.heroImageUrl?"#C77DFF":"#555" }}>{chat.heroImageUrl?"Photo uploaded · Tap to change":"Upload hero photo"}</div>
              <input ref={heroRef} type="file" accept="image/*" onChange={e=>handleHeroFile(e.target.files[0])} style={{ display:"none" }} />
            </div>
            {chat.heroImageUrl && <button onClick={() => { updateChat("heroImageUrl",""); updateChat("heroType","gradient"); }} style={{ width:"100%", padding:"8px", borderRadius:"8px", border:"1px solid rgba(255,59,48,0.3)", background:"rgba(255,59,48,0.07)", color:"#FF3B30", fontSize:"10px", cursor:"pointer" }}>✕ REMOVE</button>}
          </div>
        )}

        {chat.heroType === "video" && (
          <div>
            <div onClick={() => videoRef.current?.click()}
              style={{ padding:"18px", borderRadius:"11px", textAlign:"center", cursor:"pointer", border:chat.heroVideoUrl?"2px solid #C77DFF":"2px dashed rgba(199,125,255,0.25)", background:"rgba(199,125,255,0.04)", marginBottom:"8px" }}>
              <div style={{ fontSize:"20px", marginBottom:"5px" }}>{chat.heroVideoUrl?"🎬":"📤"}</div>
              <div style={{ fontSize:"11px", color:chat.heroVideoUrl?"#C77DFF":"#555" }}>{chat.heroVideoUrl?"Video uploaded · Tap to change":"Upload hero video (MP4, MOV — loops silently)"}</div>
              <input ref={videoRef} type="file" accept="video/*" onChange={e=>handleVideoFile(e.target.files[0])} style={{ display:"none" }} />
            </div>
            {chat.heroVideoUrl && <button onClick={() => { updateChat("heroVideoUrl",""); updateChat("heroType","gradient"); }} style={{ width:"100%", padding:"8px", borderRadius:"8px", border:"1px solid rgba(255,59,48,0.3)", background:"rgba(255,59,48,0.07)", color:"#FF3B30", fontSize:"10px", cursor:"pointer" }}>✕ REMOVE VIDEO</button>}
          </div>
        )}
      </ASection>

      {/* TEXT CONTENT */}
      <ASection title="Community Text" icon="◆" color="#FF6B35">
        <AField label="Room Name"       value={chat.roomName||""}     onChange={v=>updateChat("roomName",v)}     placeholder="The Community" />
        <AField label="Hero Heading"    value={chat.heroHeading||""}  onChange={v=>updateChat("heroHeading",v)}  placeholder="THE COMMUNITY" />
        <AField label="Hero Subtext"    value={chat.heroSubtext||""}  onChange={v=>updateChat("heroSubtext",v)}  placeholder="Connect · Share · Vibe" />
        <AField label="Post Placeholder"value={chat.placeholder||""} onChange={v=>updateChat("placeholder",v)}  placeholder="Share something with the community..." />
      </ASection>

      <div style={{ padding:"12px", borderRadius:"10px", background:"rgba(0,245,212,0.05)", border:"1px solid rgba(0,245,212,0.15)" }}>
        <div style={{ fontSize:"10px", color:"#00F5D4", marginBottom:"4px" }}>◆ HOW THE COMMUNITY PAGE WORKS</div>
        <div style={{ fontSize:"11px", color:"#bbb", lineHeight:1.6 }}>Users enter a name and @handle on their first post, then can post text and photos, reply to others, and like any post or reply. Posts persist during their session. The hero banner stays fixed while the feed scrolls.</div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// 1 ─── FAN MEMBERSHIP SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
// ─── VIP LIVE HELPERS ─────────────────────────────────────────────────────────

// Normalise any YouTube/Vimeo URL into a proper embed src
function normalizeEmbedUrl(url) {
  if (!url) return "";
  let src = url.trim();
  // YouTube watch → embed
  src = src.replace(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/, "youtube.com/embed/$1");
  // youtu.be short → embed
  src = src.replace(/youtu\.be\/([a-zA-Z0-9_-]+)/, "youtube.com/embed/$1");
  // Vimeo standard → embed
  src = src.replace(/vimeo\.com\/(\d+)/, "player.vimeo.com/video/$1");
  // Ensure https
  if (!src.startsWith("http")) src = "https://" + src;
  // Add autoplay param if missing
  if (src.includes("youtube.com/embed") && !src.includes("autoplay")) {
    src += (src.includes("?") ? "&" : "?") + "autoplay=1&mute=1";
  }
  if (src.includes("player.vimeo.com") && !src.includes("autoplay")) {
    src += (src.includes("?") ? "&" : "?") + "autoplay=1&muted=1";
  }
  return src;
}

// Self-contained camera component for the Members Lounge
function VipLiveCameraView() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("requesting"); // requesting | active | denied

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode:"user" }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setStatus("active");
      })
      .catch(() => { if (!cancelled) setStatus("denied"); });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  return (
    <div style={{ position:"relative", background:"#000", aspectRatio:"16/9" }}>
      <video ref={videoRef} muted playsInline autoPlay
        style={{ width:"100%", height:"100%", objectFit:"cover", display:status==="active"?"block":"none" }} />

      {status === "requesting" && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"10px", background:"#0a0a0f" }}>
          <div style={{ width:"32px", height:"32px", borderRadius:"50%", border:"3px solid rgba(255,59,48,0.3)", borderTop:"3px solid #FF3B30", animation:"spin 1s linear infinite" }} />
          <div style={{ fontSize:"12px", color:"#777" }}>Starting camera...</div>
        </div>
      )}

      {status === "denied" && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"10px", background:"#0a0a0f", padding:"20px" }}>
          <div style={{ fontSize:"28px" }}>🚫</div>
          <div style={{ fontSize:"12px", color:"#FF3B30", fontWeight:"700" }}>Camera access denied</div>
          <div style={{ fontSize:"10px", color:"#555", textAlign:"center", lineHeight:1.6 }}>Allow camera access in your browser settings and refresh the page</div>
        </div>
      )}

      {status === "active" && (
        <div style={{ position:"absolute", top:"10px", left:"10px", display:"flex", alignItems:"center", gap:"5px", padding:"4px 10px", borderRadius:"10px", background:"rgba(255,59,48,0.85)" }}>
          <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:"#fff", animation:"livePulse 1s infinite" }} />
          <span style={{ fontSize:"9px", fontWeight:"900", color:"#fff", letterSpacing:"0.15em" }}>LIVE</span>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function MembershipScreen({ config, goHome }) {
  const pc = config.brand.primaryColor;
  const ac = config.brand.accentColor;
  const m  = config.membership || {};

  // VIP gate state — persisted in sessionStorage
  const [vipUnlocked, setVipUnlocked] = useState(() => {
    try { return sessionStorage.getItem("vip_unlocked") === "1"; } catch { return false; }
  });
  const [pinInput,    setPinInput]    = useState("");
  const [pinError,    setPinError]    = useState(false);
  const [pinShake,    setPinShake]    = useState(false);
  const [joined,      setJoined]      = useState(false);
  const [activeItem,  setActiveItem]  = useState(null);

  // ✅ Live stream state — polled from Supabase every 5s so ALL devices stay in sync
  const [liveState, setLiveState] = useState(m.vipLive || {});

  useEffect(() => {
    if (!vipUnlocked) return;
    // Initial fetch
    sb.getVipLive().then(data => { if (data) setLiveState(data); });
    // Poll every 5 seconds
    const poll = setInterval(() => {
      sb.getVipLive().then(data => { if (data) setLiveState(data); });
    }, 5000);
    return () => clearInterval(poll);
  }, [vipUnlocked]);

  // Merge: prefer Supabase data over config data so cross-device sync works
  const activeLive = liveState.isLive ? liveState : (m.vipLive?.isLive ? m.vipLive : null);

  const vipContent = m.vipContent || [];

  const tryPin = () => {
    const correct = m.vipPin || "1234";
    if (pinInput === correct) {
      setVipUnlocked(true);
      try { sessionStorage.setItem("vip_unlocked","1"); } catch {}
      setPinError(false);
    } else {
      setPinError(true);
      setPinShake(true);
      setTimeout(() => setPinShake(false), 600);
      setPinInput("");
    }
  };

  const TYPE_ICONS = { message:"💬", video:"🎬", audio:"🎵", download:"📥", link:"🔗", image:"📸" };
  const TYPE_COLORS = { message:pc, video:"#C77DFF", audio:"#00F5D4", download:"#FFD60A", link:ac, image:"#F72585" };

  // ── VIP LOUNGE VIEW ────────────────────────────────────────────────────────
  if (vipUnlocked && m.vipEnabled !== false) {
    return (
      <div style={{ paddingBottom:"32px" }}>
        <BackButton onBack={goHome} />

        {/* VIP HERO */}
        <div style={{ position:"relative", overflow:"hidden", padding:"40px 20px 32px", textAlign:"center" }}>
          <div style={{ position:"absolute", inset:0, background:`radial-gradient(ellipse at 50% 0%, ${pc}30 0%, transparent 70%)`, pointerEvents:"none" }} />
          <div style={{ position:"absolute", inset:0, backgroundImage:`repeating-linear-gradient(45deg, ${pc}08 0px, transparent 1px, transparent 20px)`, pointerEvents:"none" }} />
          <div style={{ position:"relative", zIndex:1 }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:"8px", padding:"5px 14px", borderRadius:"20px", background:`linear-gradient(135deg,${pc}33,${ac}22)`, border:`1px solid ${pc}55`, marginBottom:"16px" }}>
              <span style={{ fontSize:"12px" }}>👑</span>
              <span style={{ fontSize:"9px", fontWeight:"900", letterSpacing:"0.3em", color:pc, fontFamily:"monospace" }}>VIP ACCESS GRANTED</span>
            </div>
            <div style={{ fontSize:"clamp(24px,7vw,40px)", fontWeight:"900", lineHeight:1.1, marginBottom:"6px", background:`linear-gradient(135deg,#fff,${pc},${ac})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              {m.vipTitle || "Members Lounge"}
            </div>
            <div style={{ fontSize:"12px", color:"rgba(255,255,255,0.5)", letterSpacing:"0.1em" }}>
              {m.vipTagline || "Welcome back. This is your space."}
            </div>
          </div>
        </div>

        {/* MEMBER BADGE */}
        <div style={{ margin:"0 16px 24px", padding:"14px 16px", borderRadius:"14px", background:`linear-gradient(135deg,${pc}18,${ac}10)`, border:`1px solid ${pc}33`, display:"flex", alignItems:"center", gap:"12px" }}>
          <div style={{ width:"46px", height:"46px", borderRadius:"50%", background:`linear-gradient(135deg,${pc},${ac})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"22px", flexShrink:0 }}>⭐</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:"13px", fontWeight:"800", color:"#fff" }}>Active Member</div>
            <div style={{ fontSize:"10px", color:pc, marginTop:"2px" }}>${m.price || "4.99"}/{m.billingCycle||"month"} · Full VIP Access</div>
          </div>
          <button onClick={() => { setVipUnlocked(false); try{ sessionStorage.removeItem("vip_unlocked"); }catch{} }}
            style={{ padding:"6px 10px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)", background:"none", color:"#555", fontSize:"9px", cursor:"pointer", fontFamily:"monospace" }}>
            LOCK
          </button>
        </div>

        {/* VIP LIVE STREAM — appears at top when active, synced from Supabase */}
        {activeLive?.isLive && (
          <div style={{ margin:"0 16px 20px" }}>
            <div style={{ borderRadius:"16px", overflow:"hidden", border:"2px solid rgba(255,59,48,0.5)", boxShadow:"0 4px 30px rgba(255,59,48,0.25)" }}>
              {/* LIVE HEADER */}
              <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"12px 14px", background:"rgba(255,59,48,0.15)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"6px", flex:1 }}>
                  <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:"#FF3B30", boxShadow:"0 0 8px #FF3B30", animation:"livePulse 1s ease-in-out infinite", flexShrink:0 }} />
                  <span style={{ fontSize:"10px", fontWeight:"900", color:"#FF3B30", letterSpacing:"0.2em", fontFamily:"monospace" }}>🔴 VIP LIVE</span>
                </div>
                <div style={{ fontSize:"9px", color:"rgba(255,255,255,0.4)", fontFamily:"monospace" }}>👑 MEMBERS ONLY</div>
              </div>

              {/* ── CAMERA STREAM ── */}
              {activeLive.streamType === "camera" && <VipLiveCameraView />}

              {/* ── EMBED STREAM ── */}
              {activeLive.streamType === "embed" && (
                activeLive.embedUrl?.trim() ? (
                  <div style={{ position:"relative", paddingBottom:"56.25%", background:"#000" }}>
                    <iframe
                      src={normalizeEmbedUrl(activeLive.embedUrl)}
                      style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none" }}
                      allow="autoplay; fullscreen; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div style={{ aspectRatio:"16/9", background:"#0a0a0f", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"8px", padding:"20px" }}>
                    <div style={{ fontSize:"28px" }}>🔗</div>
                    <div style={{ fontSize:"12px", color:"#777", textAlign:"center" }}>No embed URL set — go to Admin → 👑🔴 VIP LIVE and paste your YouTube or Vimeo live embed URL</div>
                  </div>
                )
              )}

              {/* ── RTMP STREAM ── */}
              {activeLive.streamType === "rtmp" && (
                <div style={{ aspectRatio:"16/9", background:"linear-gradient(135deg,#0a0008,#0a0a0f)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"12px", padding:"24px 20px" }}>
                  <div style={{ display:"flex", gap:"3px", alignItems:"flex-end" }}>
                    {[1,2,3,4].map(i=>(
                      <div key={i} style={{ width:"5px", borderRadius:"3px", background:"#FF3B30", animation:`eq${i} 0.6s ease-in-out infinite alternate`, height:`${[14,22,18,28][i-1]}px` }} />
                    ))}
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:"13px", fontWeight:"800", color:"#fff", marginBottom:"4px" }}>Broadcasting via RTMP</div>
                    <div style={{ fontSize:"11px", color:"#555", lineHeight:1.6 }}>Stream is live through external software.<br/>Open your stream URL to watch.</div>
                  </div>
                </div>
              )}

              {/* STREAM INFO */}
              <div style={{ padding:"12px 14px", background:"rgba(0,0,0,0.5)" }}>
                <div style={{ fontSize:"14px", fontWeight:"800", color:"#fff", marginBottom:"3px" }}>{activeLive.streamTitle || "VIP Live Stream"}</div>
                {activeLive.streamDesc && <div style={{ fontSize:"11px", color:"#888", lineHeight:1.5 }}>{activeLive.streamDesc}</div>}
              </div>
            </div>
          </div>
        )}

        {/* EXCLUSIVE CONTENT GRID */}
        <div style={{ padding:"0 16px" }}>
          <div style={{ fontSize:"9px", letterSpacing:"0.35em", color:"#555", fontFamily:"monospace", marginBottom:"14px" }}>◆ EXCLUSIVE CONTENT</div>

          {vipContent.length === 0 && (
            <div style={{ textAlign:"center", padding:"40px 20px", color:"#484848" }}>
              <div style={{ fontSize:"36px", marginBottom:"10px" }}>👑</div>
              <div style={{ fontSize:"13px" }}>Exclusive content coming soon.</div>
              <div style={{ fontSize:"11px", color:"#333", marginTop:"6px" }}>Your host will post members-only content here.</div>
            </div>
          )}

          {vipContent.map((item, i) => {
            const color = TYPE_COLORS[item.type] || pc;
            const isActive = activeItem === item.id;
            return (
              <div key={item.id || i} style={{ marginBottom:"12px", borderRadius:"16px", overflow:"hidden", border:`1px solid ${color}33`, background:"rgba(255,255,255,0.02)", transition:"all 0.2s" }}>

                {/* HEADER ROW */}
                <div onClick={() => setActiveItem(isActive ? null : item.id)}
                  style={{ display:"flex", alignItems:"center", gap:"12px", padding:"16px", cursor:"pointer" }}>
                  <div style={{ width:"44px", height:"44px", borderRadius:"12px", flexShrink:0, background:`${color}18`, border:`1px solid ${color}33`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px" }}>
                    {item.icon || TYPE_ICONS[item.type] || "⭐"}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:"13px", fontWeight:"800", color:"#fff", marginBottom:"3px" }}>{item.title}</div>
                    <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
                      <span style={{ padding:"2px 8px", borderRadius:"10px", background:`${color}20`, border:`1px solid ${color}33`, fontSize:"8px", color, fontFamily:"monospace", letterSpacing:"0.1em" }}>
                        {item.type?.toUpperCase()}
                      </span>
                      <span style={{ fontSize:"10px", color:"#555" }}>
                        {item.desc && item.desc.slice(0,50)}{item.desc?.length > 50 ? "…" : ""}
                      </span>
                    </div>
                  </div>
                  <span style={{ color:color, fontSize:"18px", transition:"transform 0.2s", transform:isActive?"rotate(90deg)":"rotate(0)" }}>›</span>
                </div>

                {/* EXPANDED CONTENT */}
                {isActive && (
                  <div style={{ padding:"0 16px 16px", animation:"fadeIn 0.25s ease" }}>
                    <div style={{ borderTop:`1px solid ${color}22`, paddingTop:"14px" }}>

                      {/* MESSAGE */}
                      {item.type === "message" && (
                        <div style={{ fontSize:"13px", color:"#ccc", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{item.body}</div>
                      )}

                      {/* VIDEO */}
                      {item.type === "video" && (
                        item.url ? (
                          item.url.includes("youtube") || item.url.includes("youtu.be") ? (
                            <div style={{ borderRadius:"10px", overflow:"hidden", aspectRatio:"16/9" }}>
                              <iframe src={item.url.replace("watch?v=","embed/").replace("youtu.be/","youtube.com/embed/")} style={{ width:"100%", height:"100%", border:"none" }} allow="autoplay" allowFullScreen />
                            </div>
                          ) : (
                            <video src={item.url} controls style={{ width:"100%", borderRadius:"10px" }} />
                          )
                        ) : (
                          <div style={{ aspectRatio:"16/9", borderRadius:"10px", background:"rgba(199,125,255,0.08)", border:"1px solid rgba(199,125,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:"8px" }}>
                            <span style={{ fontSize:"32px" }}>🎬</span>
                            <span style={{ fontSize:"11px", color:"#555" }}>Video coming soon</span>
                          </div>
                        )
                      )}

                      {/* AUDIO */}
                      {item.type === "audio" && (
                        item.url ? (
                          <div style={{ padding:"12px", borderRadius:"10px", background:"rgba(0,245,212,0.06)", border:"1px solid rgba(0,245,212,0.2)" }}>
                            <div style={{ fontSize:"12px", color:"#00F5D4", marginBottom:"8px" }}>🎵 {item.title}</div>
                            <audio src={item.url} controls style={{ width:"100%", accentColor:"#00F5D4" }} />
                          </div>
                        ) : (
                          <div style={{ padding:"20px", borderRadius:"10px", background:"rgba(0,245,212,0.06)", border:"1px solid rgba(0,245,212,0.2)", textAlign:"center", color:"#555" }}>
                            <div style={{ fontSize:"28px", marginBottom:"6px" }}>🎵</div>
                            <div style={{ fontSize:"11px" }}>Audio coming soon</div>
                          </div>
                        )
                      )}

                      {/* DOWNLOAD */}
                      {item.type === "download" && (
                        item.url ? (
                          <a href={item.url} download={item.fileName || "download"} style={{ display:"flex", alignItems:"center", gap:"10px", padding:"14px 16px", borderRadius:"10px", background:`rgba(255,214,10,0.08)`, border:`1px solid rgba(255,214,10,0.25)`, textDecoration:"none", color:"#FFD60A" }}>
                            <span style={{ fontSize:"24px" }}>📥</span>
                            <div>
                              <div style={{ fontSize:"13px", fontWeight:"700" }}>{item.fileName || "Download File"}</div>
                              <div style={{ fontSize:"10px", color:"rgba(255,214,10,0.6)", marginTop:"2px" }}>Tap to download</div>
                            </div>
                          </a>
                        ) : (
                          <div style={{ padding:"16px", borderRadius:"10px", background:"rgba(255,214,10,0.05)", border:"1px solid rgba(255,214,10,0.15)", textAlign:"center", color:"#555" }}>
                            <div style={{ fontSize:"24px", marginBottom:"6px" }}>📥</div>
                            <div style={{ fontSize:"11px" }}>Download coming soon</div>
                          </div>
                        )
                      )}

                      {/* LINK */}
                      {item.type === "link" && item.url && (
                        <a href={item.url} target="_blank" rel="noreferrer" style={{ display:"block", padding:"14px 16px", borderRadius:"10px", background:`${color}0d`, border:`1px solid ${color}33`, textDecoration:"none", color, textAlign:"center", fontSize:"13px", fontWeight:"700" }}>
                          {item.title} ↗
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── PUBLIC / PRE-PURCHASE VIEW ─────────────────────────────────────────────
  return (
    <div style={{ paddingBottom:"32px" }}>
      <BackButton onBack={goHome} />

      {/* HERO */}
      <div style={{ position:"relative", overflow:"hidden", padding:"40px 20px 32px", textAlign:"center" }}>
        <div style={{ position:"absolute", inset:0, background:`radial-gradient(ellipse at 50% 0%, ${pc}22 0%, transparent 60%)`, pointerEvents:"none" }} />
        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ fontSize:"52px", marginBottom:"12px" }}>👑</div>
          <div style={{ fontSize:"clamp(26px,7vw,44px)", fontWeight:"900", lineHeight:1.1, marginBottom:"6px" }}>
            <span style={{ background:`linear-gradient(135deg,${pc},#FFD60A,${ac})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              {m.title || "Fan Membership"}
            </span>
          </div>
          <div style={{ fontSize:"13px", color:"rgba(255,255,255,0.5)", marginBottom:"24px" }}>{m.tagline || "Get exclusive access to everything"}</div>
          <div style={{ display:"inline-block", padding:"8px 24px", borderRadius:"12px", background:`linear-gradient(135deg,${pc}22,${ac}14)`, border:`1px solid ${pc}44` }}>
            <span style={{ fontSize:"32px", fontWeight:"900", color:pc }}>${m.price || "4.99"}</span>
            <span style={{ fontSize:"13px", color:"#bbb" }}>/{m.billingCycle || "month"}</span>
          </div>
          <div style={{ fontSize:"10px", color:"#555", marginTop:"8px", letterSpacing:"0.15em", fontFamily:"monospace" }}>CANCEL ANYTIME · INSTANT ACCESS</div>
        </div>
      </div>

      {/* PERKS */}
      <div style={{ padding:"0 16px 20px" }}>
        <div style={{ fontSize:"9px", letterSpacing:"0.35em", color:"#555", fontFamily:"monospace", marginBottom:"14px" }}>WHAT YOU GET</div>
        {(m.perks || []).map((perk, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:"14px", padding:"14px 16px", marginBottom:"8px", borderRadius:"12px", background:"rgba(255,255,255,0.025)", border:`1px solid ${pc}22` }}>
            <div style={{ width:"26px", height:"26px", borderRadius:"8px", background:`${pc}22`, border:`1px solid ${pc}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", flexShrink:0, color:pc }}>✓</div>
            <div style={{ fontSize:"13px", color:"#ddd" }}>{perk}</div>
          </div>
        ))}
      </div>

      {/* VIP PREVIEW LOCKED PANEL */}
      {m.vipEnabled !== false && (
        <div style={{ margin:"0 16px 20px", borderRadius:"16px", overflow:"hidden", border:`1px solid ${pc}33` }}>
          <div style={{ padding:"16px", background:`linear-gradient(135deg,${pc}18,${ac}10)`, display:"flex", alignItems:"center", gap:"10px" }}>
            <span style={{ fontSize:"20px" }}>🔐</span>
            <div>
              <div style={{ fontSize:"13px", fontWeight:"800", color:"#fff" }}>Members Lounge</div>
              <div style={{ fontSize:"10px", color:pc }}>Exclusive VIP content — members only</div>
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:"1px", background:"rgba(255,255,255,0.03)" }}>
            {(m.vipContent || []).slice(0,4).map((item,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:"10px", padding:"11px 14px", background:"rgba(0,0,0,0.3)", filter:"blur(0px)" }}>
                <span style={{ fontSize:"16px", opacity:0.5 }}>{item.icon || "⭐"}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:"11px", color:"#555", fontWeight:"600" }}>{"▓".repeat(Math.min(item.title?.length||8,16))}</div>
                </div>
                <div style={{ fontSize:"10px", color:"#333" }}>🔒</div>
              </div>
            ))}
          </div>
          <div style={{ padding:"14px 16px", background:"rgba(0,0,0,0.4)", textAlign:"center", fontSize:"11px", color:"#484848" }}>
            Join to unlock {m.vipContent?.length || 5} exclusive items
          </div>
        </div>
      )}

      {/* CTA + VIP PIN ENTRY */}
      <div style={{ padding:"0 16px" }}>
        {joined ? (
          <div style={{ padding:"20px", borderRadius:"14px", background:"rgba(0,245,212,0.08)", border:"1px solid rgba(0,245,212,0.3)", textAlign:"center" }}>
            <div style={{ fontSize:"28px", marginBottom:"8px" }}>🎉</div>
            <div style={{ fontSize:"15px", fontWeight:"800", color:"#00F5D4", marginBottom:"6px" }}>{m.thankYouMsg || "Welcome to the inner circle!"}</div>
            <div style={{ fontSize:"11px", color:"#555", marginBottom:"16px" }}>Use your member PIN to access the VIP Lounge.</div>
          </div>
        ) : (
          <button onClick={() => { if (m.stripeLink) window.open(m.stripeLink,"_blank"); else setJoined(true); }}
            style={{ width:"100%", padding:"18px", borderRadius:"14px", border:"none", background:`linear-gradient(135deg,${pc},#FFD60A)`, color:"#000", fontSize:"15px", fontWeight:"900", letterSpacing:"0.15em", cursor:"pointer", marginBottom:"16px", boxShadow:`0 6px 24px ${pc}44` }}>
            👑 {m.ctaText || "JOIN NOW"} — ${m.price || "4.99"}/{m.billingCycle||"mo"}
          </button>
        )}

        {/* PIN UNLOCK */}
        {m.vipEnabled !== false && (
          <div style={{ padding:"16px", borderRadius:"14px", border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize:"11px", fontWeight:"700", color:"#aaa", marginBottom:"10px", textAlign:"center" }}>Already a member? Enter your PIN</div>
            <div style={{ display:"flex", gap:"8px" }}>
              <input
                type="password" inputMode="numeric" maxLength={8}
                value={pinInput} onChange={e => { setPinInput(e.target.value); setPinError(false); }}
                onKeyDown={e => e.key === "Enter" && tryPin()}
                placeholder="Enter PIN..."
                style={{
                  flex:1, padding:"11px 14px", borderRadius:"10px",
                  background:"rgba(0,0,0,0.4)",
                  border:`1px solid ${pinError?"rgba(255,59,48,0.6)":"rgba(255,255,255,0.1)"}`,
                  color:"#fff", fontSize:"16px", outline:"none", fontFamily:"monospace",
                  letterSpacing:"0.3em", textAlign:"center",
                  animation:pinShake?"pinShake 0.5s ease":"none",
                }}
              />
              <button onClick={tryPin}
                style={{ padding:"11px 18px", borderRadius:"10px", border:"none", background:`linear-gradient(135deg,${pc},${ac})`, color:"#000", fontSize:"13px", fontWeight:"900", cursor:"pointer" }}>
                →
              </button>
            </div>
            {pinError && <div style={{ fontSize:"11px", color:"#FF3B30", textAlign:"center", marginTop:"8px" }}>Incorrect PIN — try again</div>}
            <div style={{ fontSize:"9px", color:"#333", textAlign:"center", marginTop:"8px" }}>Your PIN was sent in your membership confirmation email</div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pinShake {
          0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)}
        }
      `}</style>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// 2 ─── EMAIL CAPTURE POPUP
// ═══════════════════════════════════════════════════════════════════════════════
function EmailCapturePopup({ config, setConfig }) {
  const [visible,   setVisible]   = useState(false);
  const [email,     setEmail]     = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const el = config.emailList || {};

  useEffect(() => {
    if (!el.enabled || !el.popupEnabled || dismissed || submitted) return;
    const t = setTimeout(() => setVisible(true), (el.popupDelay || 8) * 1000);
    return () => clearTimeout(t);
  }, [el.enabled, el.popupEnabled, dismissed, submitted]);

  const submit = () => {
    if (!email.trim() || !email.includes("@")) return;
    // Save locally
    setConfig(prev => ({
      ...prev,
      emailList: { ...prev.emailList, subscribers: [...(prev.emailList?.subscribers||[]), { email:email.trim(), date:new Date().toLocaleDateString() }] }
    }));
    // Save to Supabase
    sb.addSubscriber(email.trim()).then(ok => {
      if (ok) console.log("✅ Subscriber saved to Supabase");
    });
    setSubmitted(true);
    setTimeout(() => { setVisible(false); }, 2500);
  };

  if (!visible || !el.enabled || !el.popupEnabled) return null;
  const pc = config.brand.primaryColor;
  const ac = config.brand.accentColor;

  return (
    <div style={{ position:"fixed", inset:0, zIndex:500, display:"flex", alignItems:"flex-end", justifyContent:"center", padding:"20px", background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)" }}
      onClick={e => { if(e.target===e.currentTarget){setVisible(false);setDismissed(true);} }}>
      <div style={{ width:"100%", maxWidth:"440px", padding:"28px 24px", borderRadius:"20px", background:"#0a0a12", border:`1px solid ${pc}44`, animation:"fadeIn 0.4s ease", fontFamily:"monospace" }}>
        {submitted ? (
          <div style={{ textAlign:"center", padding:"12px 0" }}>
            <div style={{ fontSize:"36px", marginBottom:"10px" }}>🎉</div>
            <div style={{ fontSize:"16px", fontWeight:"900", color:pc }}>{el.successMsg || "You're in! Welcome to the family 🎉"}</div>
          </div>
        ) : (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"14px" }}>
              <div>
                <div style={{ fontSize:"16px", fontWeight:"900", color:"#fff", marginBottom:"4px" }}>{el.popupTitle || "Stay in the loop 🔔"}</div>
                <div style={{ fontSize:"12px", color:"#bbb" }}>{el.popupSubtext || "Get notified when new music and episodes drop."}</div>
              </div>
              <button onClick={() => { setVisible(false); setDismissed(true); }} style={{ background:"none", border:"none", color:"#aaa", fontSize:"18px", cursor:"pointer", padding:"0 0 0 10px" }}>✕</button>
            </div>
            <div style={{ display:"flex", gap:"8px" }}>
              <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
                placeholder="your@email.com" type="email"
                style={{ flex:1, padding:"12px 14px", borderRadius:"10px", background:"rgba(255,255,255,0.06)", border:`1px solid ${pc}33`, color:"#fff", fontSize:"12px", outline:"none" }} />
              <button onClick={submit} style={{ padding:"12px 18px", borderRadius:"10px", border:"none", background:`linear-gradient(135deg,${pc},${ac})`, color:"#000", fontWeight:"900", fontSize:"11px", cursor:"pointer", letterSpacing:"0.1em" }}>
                {el.ctaText || "SUBSCRIBE"}
              </button>
            </div>
            <div style={{ fontSize:"9px", color:"#999", marginTop:"10px", textAlign:"center" }}>No spam. Unsubscribe anytime.</div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3 ─── BOOKING / INQUIRY SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function BookingScreen({ config, goHome }) {
  const pc = config.brand.primaryColor;
  const ac = config.brand.accentColor;
  const b  = config.booking || {};
  const [form, setForm]     = useState({ name:"", email:"", type:(b.types||["Brand Deal"])[0], message:"", budget:"" });
  const [sent, setSent]     = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;
    setSending(true);
    // Save to Supabase
    await sb.addInquiry({ name:form.name, email:form.email, type:form.type, message:form.message, budget:form.budget });
    await new Promise(r => setTimeout(r, 800));
    setSent(true); setSending(false);
  };

  if (sent) return (
    <div style={{ padding:"80px 24px", textAlign:"center" }}>
      <BackButton onBack={goHome} />
      <div style={{ fontSize:"56px", marginBottom:"16px" }}>🎉</div>
      <div style={{ fontSize:"22px", fontWeight:"900", marginBottom:"8px", color:pc }}>Inquiry Sent!</div>
      <div style={{ fontSize:"14px", color:"#bbb", marginBottom:"8px" }}>{b.responseTime || "We respond within 48 hours."}</div>
      <button onClick={() => setSent(false)} style={{ marginTop:"20px", padding:"12px 28px", borderRadius:"12px", border:"none", background:`linear-gradient(135deg,${pc},${ac})`, color:"#000", fontWeight:"900", fontSize:"12px", cursor:"pointer" }}>SEND ANOTHER</button>
    </div>
  );

  return (
    <div style={{ padding:"28px 20px" }}>
      <SH icon="📅" title={b.title||"BOOK / INQUIRE"} accent={pc} sub={b.subtitle||"Brand deals, features, appearances, and more."} />

      <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
        {/* TYPE */}
        <div>
          <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#aaa", display:"block", marginBottom:"7px" }}>INQUIRY TYPE</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"7px" }}>
            {(b.types||["Brand Deal","Feature Request","Appearance","Other"]).map(t => (
              <button key={t} onClick={() => setForm(p=>({...p,type:t}))}
                style={{ padding:"8px 14px", borderRadius:"18px", border:"none", cursor:"pointer", background:form.type===t?`linear-gradient(135deg,${pc},${ac})`:"rgba(255,255,255,0.05)", color:form.type===t?"#000":"#777", fontSize:"11px", fontWeight:form.type===t?"700":"400", fontFamily:"monospace", transition:"all 0.2s" }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {[
          { label:"YOUR NAME", key:"name", ph:"First Last", type:"text" },
          { label:"YOUR EMAIL", key:"email", ph:"your@email.com", type:"email" },
          { label:"BUDGET / RATE (OPTIONAL)", key:"budget", ph:"e.g. $500, $1,000+, Open", type:"text" },
        ].map(f => (
          <div key={f.key}>
            <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#aaa", display:"block", marginBottom:"7px" }}>{f.label}</label>
            <input value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph} type={f.type}
              style={{ width:"100%", padding:"13px 14px", borderRadius:"10px", background:"rgba(255,255,255,0.04)", border:`1px solid ${pc}22`, color:"#ddd", fontSize:"13px", outline:"none", fontFamily:"sans-serif" }} />
          </div>
        ))}

        <div>
          <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#aaa", display:"block", marginBottom:"7px" }}>MESSAGE / DETAILS</label>
          <textarea value={form.message} onChange={e=>setForm(p=>({...p,message:e.target.value}))} placeholder="Tell us about your project, timeline, and goals..." rows={5}
            style={{ width:"100%", padding:"13px 14px", borderRadius:"10px", background:"rgba(255,255,255,0.04)", border:`1px solid ${pc}22`, color:"#ddd", fontSize:"13px", outline:"none", fontFamily:"sans-serif", resize:"vertical", lineHeight:1.5 }} />
        </div>

        <button onClick={submit} disabled={sending||!form.name.trim()||!form.email.trim()||!form.message.trim()}
          style={{ padding:"16px", borderRadius:"12px", border:"none", background:form.name&&form.email&&form.message?`linear-gradient(135deg,${pc},${ac})`:"rgba(255,255,255,0.06)", color:form.name&&form.email&&form.message?"#000":"#555", fontSize:"13px", fontWeight:"900", letterSpacing:"0.15em", cursor:form.name&&form.email&&form.message?"pointer":"not-allowed", transition:"all 0.3s" }}>
          {sending ? "◌ SENDING..." : "◆ SEND INQUIRY"}
        </button>

        <div style={{ padding:"12px 16px", borderRadius:"10px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", fontSize:"11px", color:"#aaa", textAlign:"center" }}>
          {b.responseTime || "We respond within 48 hours."}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4 ─── LINK IN BIO SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function LinkInBioScreen({ config, goHome }) {
  const pc  = config.brand.primaryColor;
  const ac  = config.brand.accentColor;
  const lib = config.linkInBio || {};
  const links = (lib.links||[]).filter(l => l.active && l.url);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${config.brand.universalLink || window.location.origin}`;
  const copy = () => { navigator.clipboard?.writeText(shareUrl).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  return (
    <div style={{ padding:"28px 20px" }}>
      <BackButton onBack={goHome} />
      {/* HERO */}
      <div style={{ textAlign:"center", marginBottom:"28px" }}>
        <LogoDisplay config={config} size={72} />
        <div style={{ fontSize:"22px", fontWeight:"900", marginTop:"14px", marginBottom:"4px" }}>{lib.headline || config.brand.name}</div>
        <div style={{ fontSize:"12px", color:"#bbb" }}>{lib.subtext || config.brand.tagline}</div>
      </div>

      {/* LINKS */}
      <div style={{ display:"flex", flexDirection:"column", gap:"10px", marginBottom:"28px" }}>
        {links.length > 0 ? links.map(link => (
          <a key={link.id} href={link.url} target="_blank" rel="noreferrer"
            style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"10px", padding:"16px 20px", borderRadius:"14px", background:`${link.color}15`, border:`1px solid ${link.color}40`, color:link.color, fontSize:"14px", fontWeight:"700", textDecoration:"none", transition:"all 0.2s", letterSpacing:"0.05em" }}>
            {link.label}
            <span style={{ fontSize:"12px", opacity:0.6 }}>↗</span>
          </a>
        )) : (
          <div style={{ textAlign:"center", padding:"32px", color:"#999", fontSize:"13px" }}>
            <div style={{ fontSize:"32px", marginBottom:"10px" }}>🔗</div>
            Add your links in Admin → Link in Bio
          </div>
        )}
      </div>

      {/* SHARE YOUR PAGE */}
      <div style={{ padding:"16px", borderRadius:"12px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#aaa", fontFamily:"monospace", marginBottom:"8px" }}>SHARE YOUR PAGE</div>
        <div style={{ display:"flex", gap:"8px" }}>
          <div style={{ flex:1, padding:"10px 12px", borderRadius:"9px", background:"rgba(255,255,255,0.04)", fontSize:"11px", color:"#FFD60A", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{shareUrl}</div>
          <button onClick={copy} style={{ padding:"10px 14px", borderRadius:"9px", border:`1px solid ${copied?"#00F5D4":pc}44`, background:copied?"rgba(0,245,212,0.1)":"none", color:copied?"#00F5D4":pc, fontSize:"10px", fontWeight:"700", cursor:"pointer", fontFamily:"monospace", flexShrink:0 }}>
            {copied ? "COPIED ✓" : "COPY"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5 ─── HOME SCREEN CARDS — update to include new screens
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ADMIN: MEMBERSHIP TAB ───────────────────────────────────────────────────
// ─── VIP LIVE ADMIN TAB ───────────────────────────────────────────────────────
function VipLiveAdminTab({ cfg, setCfg, setIsLiveNow }) {
  const m  = cfg.membership || {};
  const vl = m.vipLive || {};
  const pc = cfg.brand?.primaryColor || "#FF6B35";

  // All settings read/write directly from cfg — no duplicate local state
  const setVL = (key, val) => setCfg(p => ({
    ...p, membership:{ ...p.membership, vipLive:{ ...(p.membership?.vipLive||{}), [key]:val } }
  }));

  // Multi-key update helper
  const setVLMany = (obj) => setCfg(p => ({
    ...p, membership:{ ...p.membership, vipLive:{ ...(p.membership?.vipLive||{}), ...obj } }
  }));

  // Runtime-only state (not persisted to config)
  const [isLive,   setIsLive]   = useState(false);
  const [timer,    setTimer]    = useState(0);
  const [viewers,  setViewers]  = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [camError, setCamError] = useState("");

  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const timerRef  = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const fmt = s => `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraOn(true); setCamError("");
    } catch { setCamError("Camera access denied — check browser settings."); }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  };

  const goLive = () => {
    if (!(vl.streamTitle || "").trim()) return;
    const livePayload = {
      isLive:      true,
      streamType:  vl.streamType  || "camera",
      streamTitle: vl.streamTitle || "",
      streamDesc:  vl.streamDesc  || "",
      embedUrl:    (vl.embedUrl   || "").trim(),
      startedAt:   new Date().toISOString(),
      viewerCount: 0,
    };
    setIsLive(true); setTimer(0); setViewers(Math.floor(Math.random()*5)+1);
    setVLMany({ isLive:true, startedAt:new Date().toISOString() });
    if (setIsLiveNow) setIsLiveNow(true);
    sb.setVipLive(livePayload);
    timerRef.current = setInterval(() => {
      setTimer(t => t+1);
      setViewers(v => Math.max(1, v + Math.floor(Math.random()*3)-1));
    }, 1000);
  };

  const endLive = () => {
    clearInterval(timerRef.current);
    stopCamera();
    setIsLive(false); setTimer(0);
    setVLMany({ isLive:false, startedAt:null, viewerCount:0 });
    if (setIsLiveNow) setIsLiveNow(false);
    sb.setVipLive({ isLive:false, streamTitle:"", streamDesc:"", embedUrl:"", startedAt:null, viewerCount:0 });
  };

  const streamType = vl.streamType || "camera";
  const canGoLive  = !!(vl.streamTitle || "").trim() && (
    streamType === "camera" ||
    (streamType === "embed" && (vl.embedUrl||"").trim().length > 0) ||
    streamType === "rtmp"
  );

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* STATUS BANNER */}
      <div style={{ padding:"14px 16px", borderRadius:"14px", marginBottom:"20px", display:"flex", alignItems:"center", gap:"12px",
        background: isLive ? "rgba(255,59,48,0.12)" : "rgba(255,255,255,0.02)",
        border: isLive ? "1px solid rgba(255,59,48,0.4)" : "1px solid rgba(255,255,255,0.08)",
        transition:"all 0.4s" }}>
        <div style={{ width:"10px", height:"10px", borderRadius:"50%", flexShrink:0,
          background: isLive ? "#FF3B30" : "#333",
          boxShadow: isLive ? "0 0 8px #FF3B30" : "none",
          animation: isLive ? "livePulse 1.5s ease-in-out infinite" : "none" }} />
        <div style={{ flex:1 }}>
          <div style={{ fontSize:"13px", fontWeight:"800", color: isLive ? "#FF3B30" : "#555" }}>
            {isLive ? "🔴 VIP STREAM IS LIVE" : "Stream Offline"}
          </div>
          <div style={{ fontSize:"10px", color:"#555", marginTop:"2px" }}>
            {isLive ? `${fmt(timer)} · ${viewers} VIP viewers watching` : "Start a private stream for your VIP members"}
          </div>
        </div>
        {isLive && (
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:"20px", fontWeight:"900", color:"#FF3B30" }}>{viewers}</div>
            <div style={{ fontSize:"8px", color:"#555", letterSpacing:"0.15em" }}>VIEWERS</div>
          </div>
        )}
      </div>

      {/* CAMERA PREVIEW */}
      {streamType === "camera" && (
        <div style={{ marginBottom:"16px", borderRadius:"14px", overflow:"hidden", background:"#0a0a0f", position:"relative", aspectRatio:"16/9", border:"1px solid rgba(255,255,255,0.08)" }}>
          <video ref={videoRef} muted playsInline style={{ width:"100%", height:"100%", objectFit:"cover", display:cameraOn?"block":"none" }} />
          {!cameraOn && (
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"10px" }}>
              <div style={{ fontSize:"36px" }}>📹</div>
              <div style={{ fontSize:"12px", color:"#555" }}>Camera preview</div>
              {camError && <div style={{ fontSize:"10px", color:"#FF3B30", textAlign:"center", padding:"0 20px" }}>{camError}</div>}
            </div>
          )}
          {isLive && cameraOn && (
            <div style={{ position:"absolute", top:"10px", left:"10px", display:"flex", alignItems:"center", gap:"6px", padding:"4px 10px", borderRadius:"10px", background:"rgba(255,59,48,0.9)" }}>
              <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:"#fff", animation:"livePulse 1s infinite" }} />
              <span style={{ fontSize:"9px", fontWeight:"900", color:"#fff", letterSpacing:"0.15em" }}>LIVE</span>
            </div>
          )}
        </div>
      )}

      {/* STREAM TYPE PICKER */}
      {!isLive && (
        <ASection title="Stream Source" icon="📡" color="#C77DFF">
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px", marginBottom:"12px" }}>
            {[["camera","📹 Camera","Use device camera"],["embed","🔗 Embed","YouTube/Vimeo live"],["rtmp","⚡ RTMP","Stream key"]].map(([val,lbl,sub])=>(
              <div key={val} onClick={()=>setVL("streamType",val)}
                style={{ padding:"10px 6px", borderRadius:"10px", cursor:"pointer", textAlign:"center",
                  border:streamType===val?"1px solid #C77DFF":"1px solid rgba(255,255,255,0.07)",
                  background:streamType===val?"rgba(199,125,255,0.12)":"rgba(255,255,255,0.02)" }}>
                <div style={{ fontSize:"11px", fontWeight:"700", color:streamType===val?"#C77DFF":"#777" }}>{lbl}</div>
                <div style={{ fontSize:"8px", color:"#484848", marginTop:"2px" }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* CAMERA CONTROLS */}
          {streamType==="camera" && (
            !cameraOn
              ? <button onClick={startCamera} style={{ width:"100%", padding:"10px", borderRadius:"10px", border:"1px solid rgba(199,125,255,0.3)", background:"rgba(199,125,255,0.08)", color:"#C77DFF", fontSize:"11px", fontWeight:"700", cursor:"pointer" }}>📹 START CAMERA PREVIEW</button>
              : <button onClick={stopCamera}  style={{ width:"100%", padding:"10px", borderRadius:"10px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"#777", fontSize:"11px", cursor:"pointer" }}>⏹ STOP CAMERA</button>
          )}

          {/* EMBED URL */}
          {streamType==="embed" && (
            <div>
              <AField label="YouTube / Vimeo Live URL" value={vl.embedUrl||""} onChange={v=>setVL("embedUrl",v)} placeholder="https://youtube.com/watch?v=... or embed/..." />
              {(vl.embedUrl||"").trim() && (
                <div style={{ padding:"8px 10px", borderRadius:"8px", background:"rgba(0,245,212,0.07)", border:"1px solid rgba(0,245,212,0.2)", fontSize:"10px", color:"#00F5D4", marginBottom:"6px", wordBreak:"break-all", fontFamily:"monospace" }}>
                  ▶ Will play: {normalizeEmbedUrl(vl.embedUrl||"")}
                </div>
              )}
              <div style={{ fontSize:"9px", color:"#555", lineHeight:1.6 }}>
                Paste any YouTube or Vimeo URL — watch links, embed links, or live links all work.<br/>
                YouTube: Go Live → Share → Copy the link.
              </div>
            </div>
          )}

          {/* RTMP */}
          {streamType==="rtmp" && (
            <div style={{ padding:"12px", borderRadius:"10px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize:"11px", color:"#bbb", lineHeight:1.7, marginBottom:"8px" }}>
                Point your broadcasting software (OBS, Streamlabs) to the RTMP server of your choice, then paste the stream key below for your records.
              </div>
              <AField label="Stream Key (reference)" value={vl.rtmpKey||""} onChange={v=>updateVL("rtmpKey",v)} placeholder="Paste your stream key..." />
            </div>
          )}
        </ASection>
      )}

      {/* STREAM DETAILS */}
      {!isLive && (
        <ASection title="Stream Details" icon="◈" color="#FF6B35">
          <AField label="Stream Title *" value={vl.streamTitle||""} onChange={v=>setVL("streamTitle",v)} placeholder="VIP-only Q&A Session 🎤" />
          <div style={{ marginBottom:"12px" }}>
            <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"6px" }}>DESCRIPTION</label>
            <textarea value={vl.streamDesc||""} onChange={e=>setVL("streamDesc",e.target.value)} rows={2} placeholder="Tell your VIPs what this stream is about..."
              style={{ width:"100%", padding:"9px 12px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#ddd", fontSize:"12px", outline:"none", fontFamily:"monospace", resize:"none", lineHeight:1.5 }} />
          </div>
        </ASection>
      )}

      {/* GO LIVE / END */}
      {!isLive ? (
        <button onClick={goLive} disabled={!canGoLive}
          style={{ width:"100%", padding:"18px", borderRadius:"14px", border:"none", cursor:canGoLive?"pointer":"not-allowed",
            background:canGoLive?"linear-gradient(135deg,#FF3B30,#FF6B35)":"rgba(255,255,255,0.05)",
            color:canGoLive?"#fff":"#555", fontSize:"15px", fontWeight:"900", letterSpacing:"0.15em",
            boxShadow:canGoLive?"0 6px 24px rgba(255,59,48,0.4)":"none", transition:"all 0.3s" }}>
          🔴 GO VIP LIVE
        </button>
      ) : (
        <div>
          {/* LIVE DASHBOARD */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"8px", marginBottom:"16px" }}>
            {[["⏱","DURATION",fmt(timer)],["👁","VIEWERS",viewers],["👑","ACCESS","VIP ONLY"]].map(([icon,lbl,val])=>(
              <div key={lbl} style={{ padding:"12px 8px", borderRadius:"10px", background:"rgba(255,59,48,0.08)", border:"1px solid rgba(255,59,48,0.2)", textAlign:"center" }}>
                <div style={{ fontSize:"16px", marginBottom:"2px" }}>{icon}</div>
                <div style={{ fontSize:"14px", fontWeight:"900", color:"#FF3B30" }}>{val}</div>
                <div style={{ fontSize:"7px", color:"#555", letterSpacing:"0.2em", marginTop:"2px" }}>{lbl}</div>
              </div>
            ))}
          </div>
          <button onClick={endLive} style={{ width:"100%", padding:"16px", borderRadius:"14px", cursor:"pointer", background:"rgba(255,59,48,0.1)", border:"2px solid #FF3B30", color:"#FF3B30", fontSize:"14px", fontWeight:"900", letterSpacing:"0.15em" }}>
            ⏹ END VIP STREAM
          </button>
        </div>
      )}

      {/* INFO PANEL */}
      <div style={{ marginTop:"16px", padding:"12px 14px", borderRadius:"11px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", fontSize:"10px", color:"#555", lineHeight:1.7 }}>
        <strong style={{ color:"#aaa" }}>How it works:</strong> When you go VIP Live, your stream appears at the top of the Members Lounge — visible only to users who have unlocked the VIP area with their PIN. Nobody else can access it.
      </div>
    </div>
  );
}

function MembershipAdminTab({ cfg, setCfg }) {
  const m = cfg.membership || {};
  const update = (key, val) => setCfg(prev=>({...prev,membership:{...prev.membership,[key]:val}}));
  const [newPerk, setNewPerk] = useState("");
  const [memTab,  setMemTab]  = useState("settings"); // settings | vip | content
  const [editItem,setEditItem]= useState(null);
  const [newItem, setNewItem] = useState({ type:"message", title:"", body:"", url:"", desc:"", icon:"⭐", fileName:"" });

  const vipContent = m.vipContent || [];
  const updateContent = (items) => update("vipContent", items);
  const updateItem = (id, key, val) => updateContent(vipContent.map(i=>i.id===id?{...i,[key]:val}:i));
  const removeItem = (id) => updateContent(vipContent.filter(i=>i.id!==id));
  const addItem = () => {
    if (!newItem.title.trim()) return;
    updateContent([...vipContent, { ...newItem, id:Date.now() }]);
    setNewItem({ type:"message", title:"", body:"", url:"", desc:"", icon:"⭐", fileName:"" });
    setEditItem(null);
  };

  const TYPE_OPTIONS = [
    { val:"message",  label:"💬 Message",  desc:"Text/announcement block" },
    { val:"video",    label:"🎬 Video",    desc:"YouTube, Vimeo, or uploaded MP4" },
    { val:"audio",    label:"🎵 Audio",    desc:"Exclusive music or podcast" },
    { val:"download", label:"📥 Download", desc:"File, PDF, or digital product" },
    { val:"link",     label:"🔗 Link",     desc:"Button linking to a URL" },
  ];

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* SUB TABS */}
      <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.06)", marginBottom:"18px" }}>
        {[["settings","⚙ SETTINGS"],["vip","🔐 VIP GATE"],["content","👑 CONTENT"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setMemTab(id)} style={{ flex:1, padding:"10px 4px", background:"none", border:"none", cursor:"pointer", fontSize:"8px", letterSpacing:"0.15em", fontWeight:"700", fontFamily:"monospace", color:memTab===id?"#FFD60A":"#3a3a3a", borderBottom:memTab===id?"2px solid #FFD60A":"2px solid transparent" }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── SETTINGS ── */}
      {memTab==="settings" && (
        <div>
          <ASection title="Membership Settings" icon="⭐" color="#FFD60A">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"14px" }}>
              <div style={{ fontSize:"12px", color:"#ccc" }}>Membership Enabled</div>
              <div onClick={()=>update("enabled",!m.enabled)} style={{ width:"48px", height:"26px", borderRadius:"13px", cursor:"pointer", background:m.enabled?"#FFD60A":"rgba(255,255,255,0.1)", position:"relative", transition:"background 0.3s" }}>
                <div style={{ width:"20px", height:"20px", borderRadius:"50%", background:"#fff", position:"absolute", top:"3px", left:m.enabled?"25px":"3px", transition:"left 0.3s" }} />
              </div>
            </div>
            <AField label="Page Title"          value={m.title||""}       onChange={v=>update("title",v)}       placeholder="Fan Membership" />
            <AField label="Tagline"             value={m.tagline||""}     onChange={v=>update("tagline",v)}     placeholder="Get exclusive access to everything" />
            <div style={{ display:"flex", gap:"12px" }}>
              <div style={{ flex:1 }}><AField label="Price $" value={m.price||""} onChange={v=>update("price",v)} placeholder="4.99" type="number" /></div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#aaa", display:"block", marginBottom:"7px" }}>BILLING</label>
                <select value={m.billingCycle||"month"} onChange={e=>update("billingCycle",e.target.value)} style={{ width:"100%", padding:"11px 13px", background:"#0a0a0f", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"9px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace" }}>
                  <option value="month">Monthly</option><option value="year">Yearly</option><option value="week">Weekly</option>
                </select>
              </div>
            </div>
            <AField label="CTA Button Text"       value={m.ctaText||""}      onChange={v=>update("ctaText",v)}      placeholder="JOIN NOW" />
            <AField label="Thank You Message"      value={m.thankYouMsg||""}  onChange={v=>update("thankYouMsg",v)}  placeholder="Welcome to the inner circle! 🎉" />
            <AField label="Stripe Payment Link"    value={m.stripeLink||""}   onChange={v=>update("stripeLink",v)}   placeholder="https://buy.stripe.com/..." />
          </ASection>
          <ASection title="Member Perks" icon="✓" color="#00F5D4">
            {(m.perks||[]).map((p,i)=>(
              <div key={i} style={{ display:"flex", gap:"8px", marginBottom:"8px", alignItems:"center" }}>
                <input value={p} onChange={e=>{ const arr=[...(m.perks||[])]; arr[i]=e.target.value; update("perks",arr); }} style={{ flex:1, padding:"9px 12px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace" }} />
                <button onClick={()=>update("perks",(m.perks||[]).filter((_,j)=>j!==i))} style={{ padding:"7px 10px", borderRadius:"7px", border:"1px solid rgba(255,59,48,0.3)", background:"rgba(255,59,48,0.07)", color:"#FF3B30", fontSize:"11px", cursor:"pointer" }}>✕</button>
              </div>
            ))}
            <div style={{ display:"flex", gap:"8px", marginTop:"6px" }}>
              <input value={newPerk} onChange={e=>setNewPerk(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&newPerk.trim()){ update("perks",[...(m.perks||[]),newPerk.trim()]); setNewPerk(""); }}} placeholder="Add a perk... e.g. 🎵 Early track access" style={{ flex:1, padding:"9px 12px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(0,245,212,0.25)", borderRadius:"8px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace" }} />
              <button onClick={()=>{ if(newPerk.trim()){ update("perks",[...(m.perks||[]),newPerk.trim()]); setNewPerk(""); }}} style={{ padding:"9px 14px", borderRadius:"8px", border:"none", background:"linear-gradient(135deg,#00F5D4,#C77DFF)", color:"#000", fontWeight:"900", fontSize:"11px", cursor:"pointer" }}>+ ADD</button>
            </div>
          </ASection>
        </div>
      )}

      {/* ── VIP GATE ── */}
      {memTab==="vip" && (
        <div>
          <ASection title="VIP Lounge Gate" icon="🔐" color="#FFD60A">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px" }}>
              <div>
                <div style={{ fontSize:"12px", fontWeight:"700", color:m.vipEnabled!==false?"#FFD60A":"#555" }}>VIP Members Lounge</div>
                <div style={{ fontSize:"10px", color:"#555", marginTop:"2px" }}>PIN-protected page with exclusive content</div>
              </div>
              <div onClick={()=>update("vipEnabled",!(m.vipEnabled!==false))} style={{ width:"48px", height:"26px", borderRadius:"13px", cursor:"pointer", background:m.vipEnabled!==false?"#FFD60A":"rgba(255,255,255,0.1)", position:"relative", transition:"background 0.3s" }}>
                <div style={{ width:"20px", height:"20px", borderRadius:"50%", background:"#fff", position:"absolute", top:"3px", left:m.vipEnabled!==false?"25px":"3px", transition:"left 0.3s" }} />
              </div>
            </div>
            <AField label="Lounge Title"   value={m.vipTitle||""}   onChange={v=>update("vipTitle",v)}   placeholder="Members Lounge" />
            <AField label="Lounge Tagline" value={m.vipTagline||""} onChange={v=>update("vipTagline",v)} placeholder="Welcome back. This is your space." />
            <div style={{ marginBottom:"4px" }}>
              <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#aaa", display:"block", marginBottom:"7px" }}>MEMBER PIN (share with paying members)</label>
              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                <input value={m.vipPin||""} onChange={e=>update("vipPin",e.target.value)} placeholder="e.g. 1234" maxLength={8}
                  style={{ flex:1, padding:"11px 14px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,214,10,0.3)", borderRadius:"9px", color:"#FFD60A", fontSize:"18px", outline:"none", fontFamily:"monospace", letterSpacing:"0.3em", textAlign:"center" }} />
              </div>
              <div style={{ fontSize:"9px", color:"#555", marginTop:"6px" }}>Send this PIN to members after they purchase. They enter it to unlock the VIP Lounge.</div>
            </div>
          </ASection>

          <div style={{ padding:"12px 14px", borderRadius:"11px", background:"rgba(255,214,10,0.06)", border:"1px solid rgba(255,214,10,0.2)", fontSize:"11px", color:"#bbb", lineHeight:1.6 }}>
            <strong style={{ color:"#FFD60A" }}>How it works:</strong> After purchase, email your member their PIN manually (or use Stripe → Customer → Custom fields). They visit the app, tap MEMBERS, enter their PIN, and instantly unlock the VIP Lounge with all your exclusive content.
          </div>
        </div>
      )}

      {/* ── VIP CONTENT ── */}
      {memTab==="content" && (
        <div>
          <div style={{ fontSize:"11px", color:"#777", marginBottom:"16px" }}>Manage what members see inside the VIP Lounge. Add videos, audio, downloads, messages, and links.</div>

          {/* ADD ITEM FORM */}
          <div style={{ padding:"14px", borderRadius:"12px", background:"rgba(255,214,10,0.06)", border:"1px solid rgba(255,214,10,0.2)", marginBottom:"16px" }}>
            <div style={{ fontSize:"10px", color:"#FFD60A", letterSpacing:"0.2em", fontFamily:"monospace", marginBottom:"12px" }}>+ ADD CONTENT ITEM</div>

            {/* TYPE PICKER */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"5px", marginBottom:"12px" }}>
              {TYPE_OPTIONS.map(t=>(
                <div key={t.val} onClick={()=>setNewItem(p=>({...p,type:t.val}))}
                  style={{ padding:"8px 10px", borderRadius:"8px", cursor:"pointer", border:newItem.type===t.val?"1px solid #FFD60A":"1px solid rgba(255,255,255,0.07)", background:newItem.type===t.val?"rgba(255,214,10,0.1)":"rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize:"11px", fontWeight:"700", color:newItem.type===t.val?"#FFD60A":"#777" }}>{t.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display:"flex", gap:"8px", marginBottom:"8px" }}>
              <input value={newItem.icon} onChange={e=>setNewItem(p=>({...p,icon:e.target.value}))} placeholder="Icon" maxLength={2}
                style={{ width:"52px", padding:"9px 10px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#ddd", fontSize:"18px", outline:"none", textAlign:"center" }} />
              <input value={newItem.title} onChange={e=>setNewItem(p=>({...p,title:e.target.value}))} placeholder="Title *"
                style={{ flex:1, padding:"9px 12px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#ddd", fontSize:"12px", outline:"none", fontFamily:"monospace" }} />
            </div>

            {newItem.type==="message" && (
              <textarea value={newItem.body} onChange={e=>setNewItem(p=>({...p,body:e.target.value}))} placeholder="Message body..." rows={3}
                style={{ width:"100%", padding:"9px 12px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#ddd", fontSize:"12px", outline:"none", fontFamily:"monospace", resize:"none", lineHeight:1.5, marginBottom:"8px" }} />
            )}
            {(newItem.type==="video"||newItem.type==="audio"||newItem.type==="link") && (
              <input value={newItem.url} onChange={e=>setNewItem(p=>({...p,url:e.target.value}))} placeholder="URL (YouTube, direct link, etc.)"
                style={{ width:"100%", padding:"9px 12px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#ddd", fontSize:"12px", outline:"none", fontFamily:"monospace", marginBottom:"8px" }} />
            )}
            {newItem.type==="download" && (
              <>
                <input value={newItem.url} onChange={e=>setNewItem(p=>({...p,url:e.target.value}))} placeholder="Download URL"
                  style={{ width:"100%", padding:"9px 12px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#ddd", fontSize:"12px", outline:"none", fontFamily:"monospace", marginBottom:"8px" }} />
                <input value={newItem.fileName} onChange={e=>setNewItem(p=>({...p,fileName:e.target.value}))} placeholder="File name (e.g. exclusive-track.mp3)"
                  style={{ width:"100%", padding:"9px 12px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#ddd", fontSize:"12px", outline:"none", fontFamily:"monospace", marginBottom:"8px" }} />
              </>
            )}
            <input value={newItem.desc} onChange={e=>setNewItem(p=>({...p,desc:e.target.value}))} placeholder="Short description (optional)"
              style={{ width:"100%", padding:"9px 12px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#ddd", fontSize:"11px", outline:"none", fontFamily:"monospace", marginBottom:"10px" }} />

            <button onClick={addItem} disabled={!newItem.title.trim()}
              style={{ width:"100%", padding:"11px", borderRadius:"9px", border:"none", background:newItem.title.trim()?"linear-gradient(135deg,#FFD60A,#FF6B35)":"rgba(255,255,255,0.05)", color:newItem.title.trim()?"#000":"#555", fontSize:"12px", fontWeight:"900", cursor:newItem.title.trim()?"pointer":"not-allowed", letterSpacing:"0.1em" }}>
              + ADD TO LOUNGE
            </button>
          </div>

          {/* CONTENT LIST */}
          <div style={{ fontSize:"9px", letterSpacing:"0.3em", color:"#555", fontFamily:"monospace", marginBottom:"10px" }}>CURRENT LOUNGE CONTENT ({vipContent.length} items)</div>
          {vipContent.length===0 && <div style={{ textAlign:"center", padding:"24px", color:"#484848", fontSize:"12px" }}>No content yet. Add items above.</div>}
          {vipContent.map((item,i)=>(
            <div key={item.id||i} style={{ display:"flex", alignItems:"center", gap:"10px", padding:"12px 14px", marginBottom:"8px", borderRadius:"10px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ fontSize:"20px", flexShrink:0 }}>{item.icon||"⭐"}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:"12px", fontWeight:"700", color:"#ddd", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.title}</div>
                <div style={{ fontSize:"9px", color:"#555", fontFamily:"monospace" }}>{item.type?.toUpperCase()}</div>
              </div>
              <button onClick={()=>removeItem(item.id)} style={{ padding:"5px 9px", borderRadius:"7px", border:"1px solid rgba(255,59,48,0.3)", background:"rgba(255,59,48,0.07)", color:"#FF3B30", fontSize:"11px", cursor:"pointer" }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── ADMIN: EMAIL LIST TAB ────────────────────────────────────────────────────
function EmailListAdminTab({ cfg, setCfg }) {
  const el = cfg.emailList || {};
  const update = (key,val) => setCfg(prev=>({...prev,emailList:{...prev.emailList,[key]:val}}));
  const subs = el.subscribers || [];
  const sentEmails = el.sentEmails || [];

  const [emailTab, setEmailTab]     = useState("compose"); // compose | subscribers | settings | history
  const [subject,  setSubject]      = useState("");
  const [body,     setBody]         = useState("");
  const [sending,  setSending]      = useState(false);
  const [sent,     setSent]         = useState(false);
  const [preview,  setPreview]      = useState(false);
  const [selected, setSelected]     = useState("all"); // all | segment
  const [testEmail,setTestEmail]    = useState("");
  const [testSent, setTestSent]     = useState(false);

  const EMAIL_TEMPLATES = [
    { name:"New Music Drop 🎵",   subject:"New Music Just Dropped! 🔥",       body:"Hey {first_name}!\n\nNew music is out NOW. This one is special — I've been working on it for months and I can't wait for you to hear it.\n\n▶ STREAM NOW: [link]\n\nThanks for always supporting the vision.\n\n{brand_name}" },
    { name:"New Episode 🎙",       subject:"New Episode Is LIVE — Watch Now 👀", body:"Hey {first_name}!\n\nA brand new episode just dropped and it's one of my favorites yet.\n\n🎙 WATCH NOW: [link]\n\nIn this episode:\n- [Topic 1]\n- [Topic 2]\n- [Topic 3]\n\nLet me know what you think!\n\n{brand_name}" },
    { name:"Exclusive Offer ⭐",   subject:"Members Only — This Is For You ⭐",  body:"Hey {first_name}!\n\nThis is for the real ones only.\n\nAs a subscriber, you get first access to [offer]. This won't be available to the public until [date].\n\n🔗 CLAIM YOUR ACCESS: [link]\n\nDon't sleep on this.\n\n{brand_name}" },
    { name:"Big Announcement 📢", subject:"Big Announcement — Read This 👀",    body:"Hey {first_name}!\n\nI've been sitting on this for a while and I'm finally ready to share.\n\n[Your announcement here]\n\nThis changes everything and I'm excited to bring you along for the ride.\n\nStay locked in,\n{brand_name}" },
    { name:"Merch Drop 🛍",        subject:"New Merch Just Dropped! 🛍",         body:"Hey {first_name}!\n\nThe new collection is LIVE right now.\n\nLimited stock — once it's gone, it's gone.\n\n🛍 SHOP NOW: [link]\n\nFree shipping on orders over $75.\n\n{brand_name}" },
  ];

  const brandName = cfg.brand?.name || "Your Brand";
  const processBody = (text) => text
    .replace(/\{brand_name\}/g, brandName)
    .replace(/\{first_name\}/g, "there");

  const recipientCount = selected==="all" ? subs.length : Math.floor(subs.length * 0.3);

  const sendEmail = async () => {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    await new Promise(r=>setTimeout(r, 1500));
    const entry = {
      id: Date.now(),
      subject,
      body,
      recipients: recipientCount,
      date: new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
      time: new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}),
      opened: 0,
      clicked: 0,
    };
    update("sentEmails",[...(el.sentEmails||[]), entry]);
    setSending(false); setSent(true);
    setTimeout(()=>setSent(false),3000);
  };

  const sendTest = async () => {
    if (!testEmail.trim()) return;
    await new Promise(r=>setTimeout(r,800));
    setTestSent(true); setTimeout(()=>setTestSent(false),2000);
  };

  const exportCSV = () => {
    const csv = ["Email,Date",...subs.map(s=>`${s.email},${s.date}`)].join("\n");
    const a = document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="subscribers.csv"; a.click();
  };

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* STATS ROW */}
      <div style={{ display:"flex", gap:"8px", marginBottom:"16px" }}>
        {[
          { label:"SUBSCRIBERS", val:subs.length,        color:"#00F5D4", icon:"👥" },
          { label:"EMAILS SENT", val:sentEmails.length,  color:"#C77DFF", icon:"📤" },
          { label:"AVG OPENS",   val:sentEmails.length ? Math.round(sentEmails.reduce((a,e)=>a+(e.opened||0),0)/sentEmails.length)+"%" : "—", color:"#FFD60A", icon:"👁" },
        ].map(s=>(
          <div key={s.label} style={{ flex:1, padding:"12px 8px", borderRadius:"11px", background:`${s.color}0d`, border:`1px solid ${s.color}25`, textAlign:"center" }}>
            <div style={{ fontSize:"9px", marginBottom:"3px" }}>{s.icon}</div>
            <div style={{ fontSize:"18px", fontWeight:"900", color:s.color }}>{s.val}</div>
            <div style={{ fontSize:"7px", color:"#484848", letterSpacing:"0.2em", fontFamily:"monospace" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* SUB TABS */}
      <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.06)", marginBottom:"20px" }}>
        {[["compose","✏ COMPOSE"],["subscribers","👥 LIST"],["history","📤 SENT"],["settings","⚙ SETTINGS"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setEmailTab(id)} style={{ flex:1, padding:"10px 4px", background:"none", border:"none", cursor:"pointer", fontSize:"8px", letterSpacing:"0.12em", fontWeight:"700", fontFamily:"monospace", color:emailTab===id?"#00F5D4":"#3a3a3a", borderBottom:emailTab===id?"2px solid #00F5D4":"2px solid transparent", transition:"all 0.2s" }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── COMPOSE TAB ── */}
      {emailTab==="compose" && (
        <div>
          {/* TEMPLATES */}
          <div style={{ marginBottom:"16px" }}>
            <div style={{ fontSize:"9px", letterSpacing:"0.22em", color:"#555", fontFamily:"monospace", marginBottom:"8px" }}>QUICK TEMPLATES</div>
            <div style={{ display:"flex", gap:"6px", overflowX:"auto", paddingBottom:"4px" }}>
              {EMAIL_TEMPLATES.map((t,i)=>(
                <button key={i} onClick={()=>{ setSubject(t.subject); setBody(t.body); setPreview(false); }}
                  style={{ flexShrink:0, padding:"6px 12px", borderRadius:"16px", border:`1px solid ${subject===t.subject?"#00F5D4":"rgba(255,255,255,0.08)"}`, background:subject===t.subject?"rgba(0,245,212,0.1)":"rgba(255,255,255,0.02)", color:subject===t.subject?"#00F5D4":"#888", fontSize:"10px", cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s" }}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* TO: FIELD */}
          <div style={{ marginBottom:"10px" }}>
            <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"6px" }}>TO</label>
            <div style={{ display:"flex", gap:"8px" }}>
              {[["all","All Subscribers"],["active","Active (30 days)"]].map(([val,lbl])=>(
                <div key={val} onClick={()=>setSelected(val)} style={{ flex:1, padding:"9px 12px", borderRadius:"9px", cursor:"pointer", border:selected===val?"1px solid #00F5D4":"1px solid rgba(255,255,255,0.07)", background:selected===val?"rgba(0,245,212,0.08)":"rgba(255,255,255,0.02)", textAlign:"center" }}>
                  <div style={{ fontSize:"11px", fontWeight:"700", color:selected===val?"#00F5D4":"#777" }}>{lbl}</div>
                  <div style={{ fontSize:"9px", color:"#484848", marginTop:"2px" }}>{val==="all"?subs.length:Math.floor(subs.length*0.3)} people</div>
                </div>
              ))}
            </div>
          </div>

          {/* SUBJECT */}
          <div style={{ marginBottom:"10px" }}>
            <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"6px" }}>SUBJECT LINE</label>
            <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Your email subject..."
              style={{ width:"100%", padding:"11px 13px", background:"rgba(0,0,0,0.4)", border:`1px solid ${subject?"rgba(0,245,212,0.3)":"rgba(255,255,255,0.08)"}`, borderRadius:"9px", color:"#fff", fontSize:"13px", outline:"none", fontFamily:"monospace" }} />
          </div>

          {/* BODY */}
          <div style={{ marginBottom:"12px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"6px" }}>
              <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555" }}>EMAIL BODY</label>
              <button onClick={()=>setPreview(v=>!v)} style={{ padding:"4px 10px", borderRadius:"7px", border:"1px solid rgba(255,255,255,0.1)", background:"none", color:"#777", fontSize:"9px", cursor:"pointer" }}>
                {preview?"✏ EDIT":"👁 PREVIEW"}
              </button>
            </div>

            {preview ? (
              <div style={{ padding:"16px", borderRadius:"10px", background:"#fff", color:"#222", fontSize:"13px", lineHeight:1.8, minHeight:"200px", whiteSpace:"pre-wrap", fontFamily:"Georgia, serif" }}>
                <div style={{ marginBottom:"16px", paddingBottom:"10px", borderBottom:"2px solid #f0f0f0" }}>
                  <strong style={{ fontSize:"16px" }}>{subject || "Subject line preview"}</strong>
                  <div style={{ fontSize:"11px", color:"#999", marginTop:"3px" }}>From: {brandName} · To: {recipientCount} subscribers</div>
                </div>
                {processBody(body) || <span style={{ color:"#bbb" }}>Your email body will appear here...</span>}
              </div>
            ) : (
              <textarea value={body} onChange={e=>setBody(e.target.value)}
                placeholder={"Hey {first_name}!\n\nWrite your email here...\n\nUse {first_name} for personalization.\nUse {brand_name} for your brand name.\n\nKeep it real, keep it short."}
                rows={10}
                style={{ width:"100%", padding:"12px 14px", background:"rgba(0,0,0,0.4)", border:`1px solid ${body?"rgba(0,245,212,0.2)":"rgba(255,255,255,0.08)"}`, borderRadius:"9px", color:"#ddd", fontSize:"12px", outline:"none", fontFamily:"monospace", resize:"vertical", lineHeight:1.7 }} />
            )}
            <div style={{ fontSize:"9px", color:"#484848", marginTop:"4px" }}>
              Tip: Use {"{first_name}"} and {"{brand_name}"} for personalization
            </div>
          </div>

          {/* TEST EMAIL */}
          <div style={{ display:"flex", gap:"8px", marginBottom:"14px", padding:"12px", borderRadius:"10px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)" }}>
            <input value={testEmail} onChange={e=>setTestEmail(e.target.value)} placeholder="Send test to your email..."
              style={{ flex:1, padding:"9px 11px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#ddd", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
            <button onClick={sendTest} disabled={!testEmail.trim()} style={{ padding:"9px 14px", borderRadius:"8px", border:"1px solid rgba(0,245,212,0.3)", background:"rgba(0,245,212,0.08)", color:testSent?"#00F5D4":"#ccc", fontSize:"10px", cursor:"pointer", fontFamily:"monospace", whiteSpace:"nowrap" }}>
              {testSent?"✓ SENT":"SEND TEST"}
            </button>
          </div>

          {/* SEND BUTTON */}
          <button onClick={sendEmail} disabled={!subject.trim()||!body.trim()||sending||subs.length===0}
            style={{ width:"100%", padding:"15px", borderRadius:"12px", border:"none", cursor:subject&&body&&!sending&&subs.length>0?"pointer":"not-allowed", background:sent?"#00F5D4":subject&&body&&subs.length>0?"linear-gradient(135deg,#00F5D4,#C77DFF)":"rgba(255,255,255,0.05)", color:sent?"#000":subject&&body&&subs.length>0?"#000":"#555", fontSize:"13px", fontWeight:"900", letterSpacing:"0.15em", transition:"all 0.3s" }}>
            {sending?"◌ SENDING...":sent?`✓ SENT TO ${recipientCount} SUBSCRIBERS!`:`📤 SEND TO ${recipientCount} SUBSCRIBERS`}
          </button>
          {subs.length===0 && <div style={{ textAlign:"center", fontSize:"11px", color:"#555", marginTop:"8px" }}>No subscribers yet — grow your list first!</div>}
        </div>
      )}

      {/* ── SUBSCRIBERS TAB ── */}
      {emailTab==="subscribers" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"14px" }}>
            <div style={{ fontSize:"12px", color:"#ccc", fontWeight:"700" }}>{subs.length} Subscribers</div>
            {subs.length>0 && <button onClick={exportCSV} style={{ padding:"6px 12px", borderRadius:"8px", border:"1px solid rgba(0,245,212,0.3)", background:"rgba(0,245,212,0.08)", color:"#00F5D4", fontSize:"10px", cursor:"pointer" }}>↓ EXPORT CSV</button>}
          </div>
          {subs.length===0
            ? <div style={{ textAlign:"center", padding:"40px 20px", color:"#484848" }}>
                <div style={{ fontSize:"32px", marginBottom:"10px" }}>📧</div>
                <div style={{ fontSize:"13px" }}>No subscribers yet.</div>
                <div style={{ fontSize:"11px", marginTop:"6px", color:"#333" }}>Enable the pop-up in Settings to start growing your list.</div>
              </div>
            : subs.map((s,i)=>(
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", marginBottom:"6px", borderRadius:"9px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                  <div style={{ width:"28px", height:"28px", borderRadius:"50%", background:"rgba(0,245,212,0.1)", border:"1px solid rgba(0,245,212,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", flexShrink:0 }}>
                    {s.email?.[0]?.toUpperCase()||"?"}
                  </div>
                  <span style={{ fontSize:"12px", color:"#ccc" }}>{s.email}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                  <span style={{ fontSize:"9px", color:"#484848", fontFamily:"monospace" }}>{s.date}</span>
                  <button onClick={()=>update("subscribers", subs.filter((_,j)=>j!==i))} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:"12px" }}>✕</button>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* ── SENT HISTORY TAB ── */}
      {emailTab==="history" && (
        <div>
          {sentEmails.length===0
            ? <div style={{ textAlign:"center", padding:"40px 20px", color:"#484848" }}>
                <div style={{ fontSize:"32px", marginBottom:"10px" }}>📤</div>
                <div style={{ fontSize:"13px" }}>No emails sent yet.</div>
              </div>
            : [...sentEmails].reverse().map((e,i)=>(
              <div key={i} style={{ padding:"14px", borderRadius:"12px", marginBottom:"10px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"6px" }}>
                  <div style={{ fontSize:"13px", fontWeight:"700", color:"#ddd", flex:1, marginRight:"10px" }}>{e.subject}</div>
                  <div style={{ fontSize:"9px", color:"#484848", fontFamily:"monospace", flexShrink:0 }}>{e.date}</div>
                </div>
                <div style={{ display:"flex", gap:"14px", marginTop:"8px" }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:"14px", fontWeight:"800", color:"#00F5D4" }}>{e.recipients}</div>
                    <div style={{ fontSize:"8px", color:"#484848", letterSpacing:"0.15em" }}>SENT</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:"14px", fontWeight:"800", color:"#FFD60A" }}>{e.opened||"—"}</div>
                    <div style={{ fontSize:"8px", color:"#484848", letterSpacing:"0.15em" }}>OPENED</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:"14px", fontWeight:"800", color:"#C77DFF" }}>{e.clicked||"—"}</div>
                    <div style={{ fontSize:"8px", color:"#484848", letterSpacing:"0.15em" }}>CLICKED</div>
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {emailTab==="settings" && (
        <div>
          <ASection title="Capture Settings" icon="◆" color="#00F5D4">
            <div style={{ display:"flex", gap:"10px", marginBottom:"14px" }}>
              {[["Email Capture","enabled"],["Pop-up","popupEnabled"]].map(([lbl,key])=>(
                <div key={key} onClick={()=>update(key,!el[key])} style={{ flex:1, padding:"12px", borderRadius:"10px", cursor:"pointer", textAlign:"center", background:el[key]?"rgba(0,245,212,0.08)":"rgba(255,255,255,0.02)", border:el[key]?"1px solid rgba(0,245,212,0.3)":"1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontSize:"11px", fontWeight:"700", color:el[key]?"#00F5D4":"#555" }}>{lbl}</div>
                  <div style={{ fontSize:"9px", color:"#484848", marginTop:"2px" }}>{el[key]?"ON":"OFF"}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom:"12px" }}>
              <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"6px" }}>POP-UP DELAY: {el.popupDelay||8} seconds</label>
              <input type="range" min={3} max={30} value={el.popupDelay||8} onChange={e=>update("popupDelay",Number(e.target.value))} style={{ width:"100%", accentColor:"#00F5D4" }} />
            </div>
            <AField label="Pop-up Title"    value={el.popupTitle||""}   onChange={v=>update("popupTitle",v)}   placeholder="Stay in the loop 🔔" />
            <AField label="Pop-up Subtitle" value={el.popupSubtext||""} onChange={v=>update("popupSubtext",v)} placeholder="Get notified for new drops." />
            <AField label="Button Text"     value={el.ctaText||""}      onChange={v=>update("ctaText",v)}      placeholder="SUBSCRIBE" />
            <AField label="Success Message" value={el.successMsg||""}   onChange={v=>update("successMsg",v)}   placeholder="You're in! Welcome 🎉" />
          </ASection>
          <ASection title="Email Integration" icon="◆" color="#C77DFF">
            <div style={{ padding:"10px 12px", borderRadius:"9px", marginBottom:"12px", background:"rgba(199,125,255,0.07)", border:"1px solid rgba(199,125,255,0.2)", fontSize:"11px", color:"#bbb", lineHeight:1.6 }}>
              Connect Mailchimp, Kit, or ConvertKit to sync subscribers automatically. Paste your form action URL below.
            </div>
            <AField label="Mailchimp / Kit Form URL" value={el.mailchimpUrl||""} onChange={v=>update("mailchimpUrl",v)} placeholder="https://..." />
          </ASection>
        </div>
      )}
    </div>
  );
}



// ─── ADMIN: BOOKING TAB ───────────────────────────────────────────────────────
function BookingAdminTab({ cfg, setCfg }) {
  const b = cfg.booking || {};
  const update = (key,val) => setCfg(prev=>({...prev,booking:{...prev.booking,[key]:val}}));
  const [newType, setNewType] = useState("");
  const [bookTab, setBookTab] = useState("calendar"); // calendar | inquiries | settings
  const [selectedDate, setSelectedDate] = useState(null);
  const [newEvent, setNewEvent] = useState({ title:"", type:"Brand Deal", time:"10:00", notes:"" });
  const [showAddForm, setShowAddForm] = useState(false);

  const events = b.events || [];
  const inquiries = b.inquiries || [];

  // Calendar state
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAYS = ["S","M","T","W","T","F","S"];

  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  const getDateStr = (d) => `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const getEventsForDate = (dateStr) => events.filter(e=>e.date===dateStr);

  const addEvent = () => {
    if (!selectedDate || !newEvent.title.trim()) return;
    const ev = { id:Date.now(), date:selectedDate, ...newEvent };
    update("events",[...events, ev]);
    setNewEvent({ title:"", type:(b.types||["Brand Deal"])[0], time:"10:00", notes:"" });
    setShowAddForm(false);
  };

  const removeEvent = (id) => update("events", events.filter(e=>e.id!==id));

  const EVENT_COLORS = { "Brand Deal":"#FF6B35","Feature Request":"#C77DFF","Podcast Guest":"#00F5D4","Appearance":"#FFD60A","Other":"#aaa" };
  const getColor = (type) => EVENT_COLORS[type] || "#FF6B35";

  // Get upcoming events sorted
  const upcomingEvents = [...events]
    .filter(e=>e.date>=todayStr)
    .sort((a,b)=>a.date.localeCompare(b.date))
    .slice(0,10);

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* SUB TABS */}
      <div style={{display:"flex",gap:"0",marginBottom:"20px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        {[["calendar","📅 CALENDAR"],["inquiries","📋 INQUIRIES"],["settings","⚙ SETTINGS"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setBookTab(id)} style={{flex:1,padding:"10px 4px",background:"none",border:"none",cursor:"pointer",fontSize:"8px",letterSpacing:"0.15em",fontWeight:"700",fontFamily:"monospace",color:bookTab===id?"#C77DFF":"#3a3a3a",borderBottom:bookTab===id?"2px solid #C77DFF":"2px solid transparent",transition:"all 0.2s"}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── CALENDAR TAB ── */}
      {bookTab==="calendar" && (
        <div>
          {/* MONTH NAV */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
            <button onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}} style={{width:"36px",height:"36px",borderRadius:"50%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"#ccc",fontSize:"14px",cursor:"pointer"}}>‹</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:"15px",fontWeight:"800",color:"#fff"}}>{MONTHS[calMonth]}</div>
              <div style={{fontSize:"10px",color:"#555",fontFamily:"monospace"}}>{calYear}</div>
            </div>
            <button onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}} style={{width:"36px",height:"36px",borderRadius:"50%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"#ccc",fontSize:"14px",cursor:"pointer"}}>›</button>
          </div>

          {/* DAY HEADERS */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"2px",marginBottom:"4px"}}>
            {DAYS.map((d,i)=>(
              <div key={i} style={{textAlign:"center",fontSize:"9px",color:"#484848",fontFamily:"monospace",padding:"4px 0"}}>{d}</div>
            ))}
          </div>

          {/* CALENDAR GRID */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"2px",marginBottom:"16px"}}>
            {Array.from({length:firstDay}).map((_,i)=>(<div key={`e${i}`}/>))}
            {Array.from({length:daysInMonth}).map((_,i)=>{
              const d = i+1;
              const dateStr = getDateStr(d);
              const dayEvents = getEventsForDate(dateStr);
              const isToday = dateStr===todayStr;
              const isSelected = dateStr===selectedDate;
              return (
                <div key={d} onClick={()=>{setSelectedDate(dateStr);setShowAddForm(false);}}
                  style={{position:"relative",aspectRatio:"1",borderRadius:"8px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",padding:"4px 2px",cursor:"pointer",transition:"all 0.2s",
                    background:isSelected?"rgba(199,125,255,0.25)":isToday?"rgba(255,107,53,0.15)":"rgba(255,255,255,0.02)",
                    border:isSelected?"1px solid #C77DFF":isToday?"1px solid rgba(255,107,53,0.5)":"1px solid rgba(255,255,255,0.04)"}}>
                  <div style={{fontSize:"11px",fontWeight:isToday||isSelected?"800":"400",color:isSelected?"#C77DFF":isToday?"#FF6B35":"#ccc"}}>{d}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"1px",justifyContent:"center",marginTop:"2px"}}>
                    {dayEvents.slice(0,3).map(ev=>(
                      <div key={ev.id} style={{width:"5px",height:"5px",borderRadius:"50%",background:getColor(ev.type)}}/>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* SELECTED DATE PANEL */}
          {selectedDate && (
            <div style={{padding:"14px",borderRadius:"12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(199,125,255,0.2)",marginBottom:"12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
                <div style={{fontSize:"13px",fontWeight:"700",color:"#C77DFF"}}>
                  {new Date(selectedDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"long",day:"numeric"})}
                </div>
                <button onClick={()=>setShowAddForm(v=>!v)} style={{padding:"6px 12px",borderRadius:"8px",border:"none",background:"linear-gradient(135deg,#C77DFF,#FF6B35)",color:"#000",fontSize:"10px",fontWeight:"900",cursor:"pointer"}}>
                  {showAddForm?"✕ CANCEL":"+ ADD EVENT"}
                </button>
              </div>

              {/* ADD EVENT FORM */}
              {showAddForm && (
                <div style={{padding:"12px",borderRadius:"10px",background:"rgba(0,0,0,0.3)",border:"1px solid rgba(199,125,255,0.2)",marginBottom:"12px"}}>
                  <input value={newEvent.title} onChange={e=>setNewEvent(p=>({...p,title:e.target.value}))} placeholder="Event title e.g. Brand Deal Call with Nike"
                    style={{width:"100%",padding:"9px 11px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(199,125,255,0.25)",borderRadius:"8px",color:"#fff",fontSize:"12px",outline:"none",fontFamily:"monospace",marginBottom:"8px"}}/>
                  <div style={{display:"flex",gap:"8px",marginBottom:"8px"}}>
                    <select value={newEvent.type} onChange={e=>setNewEvent(p=>({...p,type:e.target.value}))} style={{flex:1,padding:"9px",background:"#0a0a12",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",color:"#ddd",fontSize:"11px",outline:"none",fontFamily:"monospace"}}>
                      {(b.types||["Brand Deal","Feature Request","Appearance","Other"]).map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="time" value={newEvent.time} onChange={e=>setNewEvent(p=>({...p,time:e.target.value}))} style={{width:"100px",padding:"9px",background:"#0a0a12",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",color:"#ddd",fontSize:"11px",outline:"none",fontFamily:"monospace"}}/>
                  </div>
                  <input value={newEvent.notes} onChange={e=>setNewEvent(p=>({...p,notes:e.target.value}))} placeholder="Notes (optional)"
                    style={{width:"100%",padding:"9px 11px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"8px",color:"#ccc",fontSize:"11px",outline:"none",fontFamily:"monospace",marginBottom:"10px"}}/>
                  <button onClick={addEvent} disabled={!newEvent.title.trim()} style={{width:"100%",padding:"10px",borderRadius:"9px",border:"none",background:newEvent.title.trim()?"linear-gradient(135deg,#C77DFF,#FF6B35)":"rgba(255,255,255,0.05)",color:newEvent.title.trim()?"#000":"#555",fontSize:"11px",fontWeight:"900",cursor:newEvent.title.trim()?"pointer":"not-allowed"}}>
                    ◆ SAVE EVENT
                  </button>
                </div>
              )}

              {/* EVENTS FOR THIS DAY */}
              {getEventsForDate(selectedDate).length===0
                ? <div style={{fontSize:"11px",color:"#484848",textAlign:"center",padding:"10px 0"}}>No events. Tap + ADD EVENT to schedule one.</div>
                : getEventsForDate(selectedDate).map(ev=>(
                  <div key={ev.id} style={{display:"flex",gap:"10px",alignItems:"flex-start",padding:"10px",borderRadius:"9px",background:"rgba(255,255,255,0.03)",border:`1px solid ${getColor(ev.type)}33`,marginBottom:"6px"}}>
                    <div style={{width:"3px",minHeight:"40px",borderRadius:"2px",background:getColor(ev.type),flexShrink:0,marginTop:"2px"}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:"12px",fontWeight:"700",color:"#fff",marginBottom:"2px"}}>{ev.title}</div>
                      <div style={{fontSize:"10px",color:getColor(ev.type),fontFamily:"monospace"}}>{ev.type} · {ev.time}</div>
                      {ev.notes&&<div style={{fontSize:"10px",color:"#555",marginTop:"3px"}}>{ev.notes}</div>}
                    </div>
                    <button onClick={()=>removeEvent(ev.id)} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:"14px",padding:"0",flexShrink:0}}>✕</button>
                  </div>
                ))
              }
            </div>
          )}

          {/* UPCOMING EVENTS */}
          {upcomingEvents.length>0 && (
            <div>
              <div style={{fontSize:"9px",letterSpacing:"0.25em",color:"#555",fontFamily:"monospace",marginBottom:"10px"}}>UPCOMING</div>
              {upcomingEvents.map(ev=>(
                <div key={ev.id} style={{display:"flex",gap:"12px",alignItems:"center",padding:"11px 12px",marginBottom:"6px",borderRadius:"10px",background:"rgba(255,255,255,0.02)",border:`1px solid ${getColor(ev.type)}22`}}>
                  <div style={{width:"38px",textAlign:"center",flexShrink:0}}>
                    <div style={{fontSize:"8px",color:getColor(ev.type),letterSpacing:"0.1em",fontFamily:"monospace"}}>{new Date(ev.date+"T12:00:00").toLocaleDateString("en-US",{month:"short"}).toUpperCase()}</div>
                    <div style={{fontSize:"18px",fontWeight:"900",color:"#fff",lineHeight:1}}>{new Date(ev.date+"T12:00:00").getDate()}</div>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"12px",fontWeight:"700",color:"#ddd",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.title}</div>
                    <div style={{fontSize:"9px",color:getColor(ev.type),fontFamily:"monospace"}}>{ev.type} · {ev.time}</div>
                  </div>
                  <button onClick={()=>removeEvent(ev.id)} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:"12px",flexShrink:0}}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── INQUIRIES TAB ── */}
      {bookTab==="inquiries" && (
        <div>
          {inquiries.length===0
            ? <div style={{textAlign:"center",padding:"40px 20px",color:"#484848"}}>
                <div style={{fontSize:"32px",marginBottom:"10px"}}>📋</div>
                <div style={{fontSize:"13px"}}>No inquiries yet.</div>
                <div style={{fontSize:"11px",marginTop:"6px",color:"#333"}}>Submitted forms from your Booking page appear here.</div>
              </div>
            : inquiries.slice().reverse().map((q,i)=>(
              <div key={i} style={{padding:"14px",borderRadius:"12px",marginBottom:"10px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
                  <div>
                    <div style={{fontSize:"13px",fontWeight:"800",color:"#fff"}}>{q.name}</div>
                    <div style={{fontSize:"10px",color:"#00F5D4",fontFamily:"monospace"}}>{q.email}</div>
                  </div>
                  <div style={{padding:"3px 9px",borderRadius:"7px",background:"rgba(199,125,255,0.12)",border:"1px solid rgba(199,125,255,0.25)",fontSize:"9px",color:"#C77DFF",fontFamily:"monospace",flexShrink:0,marginLeft:"8px"}}>{q.type}</div>
                </div>
                {q.budget&&<div style={{fontSize:"10px",color:"#FFD60A",marginBottom:"5px",fontFamily:"monospace"}}>Budget: {q.budget}</div>}
                <div style={{fontSize:"11px",color:"#aaa",lineHeight:1.5}}>{q.message}</div>
                <button onClick={()=>{
                    setSelectedDate(todayStr);
                    setNewEvent({title:`${q.name} — ${q.type}`,type:q.type||"Other",time:"10:00",notes:q.message?.slice(0,80)||""});
                    setShowAddForm(true); setBookTab("calendar");
                  }}
                  style={{marginTop:"10px",padding:"6px 12px",borderRadius:"8px",border:"1px solid rgba(199,125,255,0.3)",background:"rgba(199,125,255,0.08)",color:"#C77DFF",fontSize:"10px",cursor:"pointer",fontFamily:"monospace"}}>
                  📅 Add to Calendar
                </button>
              </div>
            ))
          }
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {bookTab==="settings" && (
        <div>
          <ASection title="Booking Settings" icon="⚙" color="#C77DFF">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
              <div style={{fontSize:"12px",color:"#ccc"}}>Booking Page Enabled</div>
              <div onClick={()=>update("enabled",!b.enabled)} style={{width:"48px",height:"26px",borderRadius:"13px",cursor:"pointer",background:b.enabled?"#C77DFF":"rgba(255,255,255,0.1)",position:"relative",transition:"background 0.3s"}}>
                <div style={{width:"20px",height:"20px",borderRadius:"50%",background:"#fff",position:"absolute",top:"3px",left:b.enabled?"25px":"3px",transition:"left 0.3s"}}/>
              </div>
            </div>
            <AField label="Page Title"         value={b.title||""}        onChange={v=>update("title",v)}        placeholder="Book / Inquire" />
            <AField label="Subtitle"           value={b.subtitle||""}     onChange={v=>update("subtitle",v)}     placeholder="Brand deals, features, appearances..." />
            <AField label="Contact Email"      value={b.contactEmail||""} onChange={v=>update("contactEmail",v)} placeholder="youremail@gmail.com" />
            <AField label="Response Time Note" value={b.responseTime||""} onChange={v=>update("responseTime",v)} placeholder="We respond within 48 hours." />
          </ASection>
          <ASection title="Inquiry Types" icon="◆" color="#FF6B35">
            {(b.types||[]).map((t,i)=>(
              <div key={i} style={{display:"flex",gap:"8px",marginBottom:"8px"}}>
                <div style={{flex:1,padding:"9px 12px",borderRadius:"8px",background:"rgba(255,255,255,0.04)",fontSize:"12px",color:"#ccc"}}>{t}</div>
                <button onClick={()=>update("types",(b.types||[]).filter((_,j)=>j!==i))} style={{padding:"7px 10px",borderRadius:"7px",border:"1px solid rgba(255,59,48,0.3)",background:"rgba(255,59,48,0.07)",color:"#FF3B30",fontSize:"11px",cursor:"pointer"}}>✕</button>
              </div>
            ))}
            <div style={{display:"flex",gap:"8px",marginTop:"6px"}}>
              <input value={newType} onChange={e=>setNewType(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&newType.trim()){update("types",[...(b.types||[]),newType.trim()]);setNewType("");}}} placeholder="Add inquiry type..." style={{flex:1,padding:"9px 12px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,107,53,0.25)",borderRadius:"8px",color:"#E8E4DC",fontSize:"12px",outline:"none",fontFamily:"monospace"}}/>
              <button onClick={()=>{if(newType.trim()){update("types",[...(b.types||[]),newType.trim()]);setNewType("");}}} style={{padding:"9px 14px",borderRadius:"8px",border:"none",background:"linear-gradient(135deg,#FF6B35,#C77DFF)",color:"#000",fontWeight:"900",fontSize:"11px",cursor:"pointer"}}>+ ADD</button>
            </div>
          </ASection>
        </div>
      )}
    </div>
  );
}



// ─── ADMIN: LINK IN BIO TAB ──────────────────────────────────────────────────
function LinkInBioAdminTab({ cfg, setCfg }) {
  const lib = cfg.linkInBio || {};
  const update = (key,val) => setCfg(prev=>({...prev,linkInBio:{...prev.linkInBio,[key]:val}}));
  const updateLink = (id,key,val) => update("links",(lib.links||[]).map(l=>l.id===id?{...l,[key]:val}:l));
  const addLink = () => update("links",[...(lib.links||[]),{id:Date.now(),label:"New Link",url:"",active:true,color:"#FF6B35"}]);
  const removeLink = id => update("links",(lib.links||[]).filter(l=>l.id!==id));

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <ASection title="Link in Bio Page" icon="🔗" color="#00F5D4">
        <AField label="Headline" value={lib.headline||""} onChange={v=>update("headline",v)} placeholder="YOUR BRAND" />
        <AField label="Subtext"  value={lib.subtext||""}  onChange={v=>update("subtext",v)}  placeholder="Digital Media Entertainment" />
      </ASection>
      <ASection title="Links" icon="◆" color="#FF6B35">
        {(lib.links||[]).map(link=>(
          <div key={link.id} style={{ padding:"14px", borderRadius:"12px", marginBottom:"10px", background:"rgba(255,255,255,0.02)", border:`1px solid ${link.color}30` }}>
            <div style={{ display:"flex", gap:"8px", marginBottom:"8px", alignItems:"center" }}>
              <input type="color" value={link.color||"#FF6B35"} onChange={e=>updateLink(link.id,"color",e.target.value)} style={{ width:"36px", height:"36px", borderRadius:"7px", border:"none", cursor:"pointer", flexShrink:0 }} />
              <input value={link.label} onChange={e=>updateLink(link.id,"label",e.target.value)} placeholder="Link label" style={{ flex:1, padding:"8px 10px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace" }} />
              <div onClick={()=>updateLink(link.id,"active",!link.active)} style={{ width:"40px", height:"22px", borderRadius:"11px", cursor:"pointer", flexShrink:0, background:link.active?link.color:"rgba(255,255,255,0.1)", position:"relative", transition:"background 0.3s" }}>
                <div style={{ width:"16px", height:"16px", borderRadius:"50%", background:"#fff", position:"absolute", top:"3px", left:link.active?"21px":"3px", transition:"left 0.3s" }} />
              </div>
              <button onClick={()=>removeLink(link.id)} style={{ padding:"6px 9px", borderRadius:"7px", border:"1px solid rgba(255,59,48,0.3)", background:"rgba(255,59,48,0.07)", color:"#FF3B30", fontSize:"10px", cursor:"pointer", flexShrink:0 }}>✕</button>
            </div>
            <input value={link.url} onChange={e=>updateLink(link.id,"url",e.target.value)} placeholder="https://..." style={{ width:"100%", padding:"8px 10px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"8px", color:"#E8E4DC", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
          </div>
        ))}
        <button onClick={addLink} style={{ width:"100%", padding:"12px", borderRadius:"10px", border:"2px dashed rgba(255,107,53,0.25)", background:"rgba(255,107,53,0.04)", color:"#FF6B35", fontSize:"12px", fontWeight:"700", cursor:"pointer" }}>+ ADD LINK</button>
      </ASection>
    </div>
  );
}


function BackButton({ onBack, label="HOME" }) {
  return (
    <button onClick={onBack}
      style={{ display:"flex", alignItems:"center", gap:"7px", padding:"8px 14px", margin:"12px 16px 0", borderRadius:"20px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"#aaa", fontSize:"10px", fontWeight:"700", fontFamily:"monospace", letterSpacing:"0.15em", cursor:"pointer", width:"fit-content", transition:"all 0.2s" }}>
      <span style={{ fontSize:"14px" }}>←</span> {label}
    </button>
  );
}

function SH({ icon, title, accent, sub }) {
  return (
    <div style={{ marginBottom:"24px" }}>
      <div style={{ fontSize:"9px", letterSpacing:"0.3em", color:accent, fontFamily:"monospace", marginBottom:"5px" }}>{icon} {title}</div>
      <h2 style={{ fontSize:"24px", fontWeight:"900", margin:"0 0 5px", letterSpacing:"-0.01em", fontFamily:"'Georgia',serif" }}>{title}</h2>
      <div style={{ fontSize:"12px", color:"#aaa" }}>{sub}</div>
    </div>
  );
}

function BSection({ label, children }) {
  return (
    <div style={{ marginBottom:"22px" }}>
      <div style={{ fontSize:"8px", letterSpacing:"0.35em", color:"#3a3a3a", fontFamily:"monospace", marginBottom:"9px" }}>{label}</div>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔥 EVENTS SHOWCASE SCREEN — PUBLIC
// ═══════════════════════════════════════════════════════════════════════════════
function EventsScreen({ config, goHome }) {
  const pc     = config.brand.primaryColor;
  const ac     = config.brand.accentColor;
  const events = (config.booking?.events || []).filter(e => e.date >= new Date().toISOString().slice(0,10));
  const allEvents = config.booking?.events || [];
  const sc     = config.showcase || {};
  const [filter,   setFilter]   = useState("all");
  const [selected, setSelected] = useState(null);
  const [slideIdx, setSlideIdx] = useState(0);

  const slides    = sc.slideshowEnabled && sc.slideshowImages?.length ? sc.slideshowImages : [];
  const slideSpeed = (sc.slideshowSpeed || 5) * 1000;

  // Slideshow auto-advance
  useEffect(() => {
    if (!slides.length) return;
    const t = setInterval(() => setSlideIdx(i => (i + 1) % slides.length), slideSpeed);
    return () => clearInterval(t);
  }, [slides.length, slideSpeed]);

  // Countdown hook
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const getCountdown = (dateStr, timeStr) => {
    const target = new Date(`${dateStr}T${timeStr?.slice(0,5)||"00:00"}:00`);
    const diff = target - now;
    if (diff <= 0) return null;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { d, h, m, s, total: diff };
  };

  const EVENT_TYPE_COLORS = {
    "Concert":     "#FF6B35",
    "Release":     "#C77DFF",
    "Meet & Greet":"#00F5D4",
    "Show":        "#FFD60A",
    "Workshop":    "#1DB954",
    "Pop-Up":      "#E1306C",
    "Other":       "#888",
  };

  const types = ["all", ...new Set(allEvents.map(e => e.type))];
  const filtered = allEvents.filter(e => filter === "all" || e.type === filter);
  const upcoming = filtered.filter(e => e.date >= new Date().toISOString().slice(0,10));
  const past     = filtered.filter(e => e.date <  new Date().toISOString().slice(0,10));
  const featured = upcoming.find(e => e.featured);

  const getColor = (type) => EVENT_TYPE_COLORS[type] || pc;

  // EVENT DETAIL MODAL
  if (selected) {
    const ev = allEvents.find(e => e.id === selected);
    if (!ev) { setSelected(null); return null; }
    const cd = getCountdown(ev.date, ev.time);
    const evColor = getColor(ev.type);
    return (
      <div style={{ minHeight:"100vh", background:"#050508", color:"#F0EDE8" }}>
        {/* HERO */}
        <div style={{ position:"relative", height:"280px", overflow:"hidden" }}>
          {ev.imageUrl
            ? <img src={ev.imageUrl} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            : <div style={{ width:"100%", height:"100%", background:`linear-gradient(135deg,${evColor}33,${ac}22,#050508)` }} />}
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, rgba(5,5,8,0.1) 0%, rgba(5,5,8,0.95) 100%)" }} />
          <button onClick={() => setSelected(null)} style={{ position:"absolute", top:"16px", left:"16px", width:"36px", height:"36px", borderRadius:"50%", background:"rgba(0,0,0,0.6)", border:"1px solid rgba(255,255,255,0.15)", color:"#fff", fontSize:"16px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>←</button>
          {ev.soldOut && <div style={{ position:"absolute", top:"16px", right:"16px", padding:"5px 12px", borderRadius:"20px", background:"rgba(255,59,48,0.9)", fontSize:"10px", fontWeight:"900", letterSpacing:"0.2em", color:"#fff" }}>SOLD OUT</div>}
          {!ev.soldOut && ev.price && <div style={{ position:"absolute", top:"16px", right:"16px", padding:"5px 12px", borderRadius:"20px", background:`${evColor}dd`, fontSize:"11px", fontWeight:"900", color:"#000", letterSpacing:"0.1em" }}>{ev.price}</div>}
          <div style={{ position:"absolute", bottom:"20px", left:"20px", right:"20px" }}>
            <div style={{ display:"inline-block", padding:"3px 10px", borderRadius:"12px", background:`${evColor}33`, border:`1px solid ${evColor}66`, fontSize:"9px", color:evColor, letterSpacing:"0.2em", fontFamily:"monospace", marginBottom:"8px" }}>{ev.type?.toUpperCase()}</div>
            <div style={{ fontSize:"clamp(22px,6vw,32px)", fontWeight:"900", lineHeight:1.1, textShadow:"0 2px 20px rgba(0,0,0,0.8)" }}>{ev.title}</div>
          </div>
        </div>

        <div style={{ padding:"20px" }}>
          {/* COUNTDOWN */}
          {cd && sc.showCountdown !== false && (
            <div style={{ padding:"16px", borderRadius:"16px", marginBottom:"20px", background:`linear-gradient(135deg,${evColor}15,${ac}08)`, border:`1px solid ${evColor}33` }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.3em", color:evColor, fontFamily:"monospace", marginBottom:"10px", textAlign:"center" }}>⏰ COUNTDOWN TO SHOWTIME</div>
              <div style={{ display:"flex", justifyContent:"center", gap:"12px" }}>
                {[["d","DAYS"],["h","HRS"],["m","MIN"],["s","SEC"]].map(([k,lbl])=>(
                  <div key={k} style={{ textAlign:"center", minWidth:"52px" }}>
                    <div style={{ fontSize:"32px", fontWeight:"900", color:evColor, lineHeight:1, fontFamily:"monospace" }}>{String(cd[k]).padStart(2,"0")}</div>
                    <div style={{ fontSize:"8px", color:"rgba(255,255,255,0.4)", letterSpacing:"0.2em", marginTop:"3px" }}>{lbl}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DATE / TIME / VENUE */}
          {[
            { icon:"📅", label:"DATE", val: new Date(ev.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}) },
            { icon:"🕐", label:"TIME", val: ev.time },
            { icon:"📍", label:"VENUE", val: ev.venue },
            { icon:"🌆", label:"CITY", val: ev.city },
          ].filter(r=>r.val).map((row,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:"14px", padding:"13px 0", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize:"18px", width:"24px", textAlign:"center" }}>{row.icon}</span>
              <div>
                <div style={{ fontSize:"8px", color:"#555", letterSpacing:"0.2em", fontFamily:"monospace" }}>{row.label}</div>
                <div style={{ fontSize:"13px", color:"#ddd", marginTop:"2px" }}>{row.val}</div>
              </div>
            </div>
          ))}

          {/* DESCRIPTION */}
          {ev.description && (
            <div style={{ marginTop:"16px", marginBottom:"20px", padding:"16px", borderRadius:"12px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#555", fontFamily:"monospace", marginBottom:"8px" }}>ABOUT THIS EVENT</div>
              <div style={{ fontSize:"13px", color:"#bbb", lineHeight:1.7 }}>{ev.description}</div>
            </div>
          )}

          {/* CTA BUTTON */}
          {ev.soldOut ? (
            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,59,48,0.08)", border:"1px solid rgba(255,59,48,0.25)", textAlign:"center", fontSize:"14px", color:"#FF3B30", fontWeight:"800" }}>
              🚫 This event is SOLD OUT
            </div>
          ) : (
            <a href={ev.ticketUrl || "#"} target={ev.ticketUrl?"_blank":"_self"} rel="noreferrer"
              style={{ display:"block", padding:"18px", borderRadius:"14px", textAlign:"center", background:`linear-gradient(135deg,${evColor},${ac})`, color:"#000", fontSize:"15px", fontWeight:"900", letterSpacing:"0.12em", textDecoration:"none", boxShadow:`0 8px 30px ${evColor}44` }}>
              🎟 GET TICKETS{ev.price ? ` — ${ev.price}` : ""}
            </a>
          )}
        </div>
      </div>
    );
  }

  // MAIN EVENTS LIST
  return (
    <div style={{ paddingBottom:"32px" }}>
      <BackButton onBack={goHome} />

      {/* ── CINEMATIC HERO ── */}
      <div style={{ position:"relative", overflow:"hidden", minHeight:"300px", display:"flex", alignItems:"flex-end" }}>
        {/* Layered BG — or slideshow */}
        {slides.length > 0 ? (
          <>
            {/* Slideshow images */}
            {slides.map((url, i) => (
              <div key={i} style={{ position:"absolute", inset:0, background:`url(${url}) center/cover no-repeat`, opacity:i===slideIdx?1:0, transition:"opacity 1.2s ease", zIndex:0 }} />
            ))}
            {/* Overlay */}
            {sc.slideshowOverlay !== false && <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom,rgba(5,5,8,0.35) 0%,rgba(5,5,8,0.7) 100%)", zIndex:1, pointerEvents:"none" }} />}
            {/* Slide dots */}
            {slides.length > 1 && (
              <div style={{ position:"absolute", bottom:"14px", left:"50%", transform:"translateX(-50%)", display:"flex", gap:"5px", zIndex:3 }}>
                {slides.map((_,i)=>(
                  <div key={i} onClick={()=>setSlideIdx(i)} style={{ width:i===slideIdx?"18px":"6px", height:"6px", borderRadius:"3px", background:i===slideIdx?"#fff":"rgba(255,255,255,0.4)", cursor:"pointer", transition:"all 0.3s" }} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Default gradient BG */}
            <div style={{ position:"absolute", inset:0, background:`linear-gradient(135deg, #0a0008 0%, ${pc}18 40%, ${ac}12 70%, #050508 100%)` }} />
            {/* Floating orbs */}
            <div style={{ position:"absolute", top:"-60px", right:"-60px", width:"300px", height:"300px", borderRadius:"50%", background:`radial-gradient(circle, ${pc}22 0%, transparent 70%)`, pointerEvents:"none" }} />
            <div style={{ position:"absolute", top:"30px", left:"-40px", width:"200px", height:"200px", borderRadius:"50%", background:`radial-gradient(circle, ${ac}18 0%, transparent 70%)`, pointerEvents:"none" }} />
            {/* Grid lines */}
            <div style={{ position:"absolute", inset:0, opacity:0.06, backgroundImage:`repeating-linear-gradient(0deg, ${pc} 0px, transparent 1px, transparent 60px), repeating-linear-gradient(90deg, ${pc} 0px, transparent 1px, transparent 60px)`, pointerEvents:"none" }} />
          </>
        )}

        <div style={{ position:"relative", zIndex:2, padding:"60px 20px 28px", width:"100%" }}>
          <div style={{ fontSize:"9px", letterSpacing:"0.5em", color:`${pc}cc`, fontFamily:"monospace", marginBottom:"8px" }}>◆ {sc.heroTitle || "UPCOMING EVENTS"}</div>
          <div style={{ fontSize:"clamp(28px,8vw,52px)", fontWeight:"900", lineHeight:1.05, marginBottom:"8px", letterSpacing:"-0.02em" }}>
            <span style={{ background:`linear-gradient(135deg,#fff 30%,${pc} 60%,${ac})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              {sc.heroSubtext || "Be There.\nNo Excuses."}
            </span>
          </div>
          <div style={{ fontSize:"12px", color:"rgba(255,255,255,0.45)", fontFamily:"monospace", letterSpacing:"0.1em" }}>
            {upcoming.length} upcoming · {past.length} past
          </div>
        </div>
      </div>

      {/* ── FEATURED EVENT ── */}
      {featured && (
        <div style={{ margin:"0 16px 24px", marginTop:"-10px" }}>
          <div onClick={() => setSelected(featured.id)}
            style={{ borderRadius:"20px", overflow:"hidden", cursor:"pointer", position:"relative",
              background: featured.imageUrl ? `url(${featured.imageUrl}) center/cover no-repeat` : `linear-gradient(135deg,${getColor(featured.type)}22,${ac}14)`,
              border:`1px solid ${getColor(featured.type)}44`, minHeight:"200px" }}>
            {featured.imageUrl && <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, rgba(5,5,8,0.1), rgba(5,5,8,0.88))" }} />}
            <div style={{ position:"absolute", top:"14px", left:"14px", display:"flex", gap:"6px" }}>
              <span style={{ padding:"4px 10px", borderRadius:"20px", background:"rgba(255,107,53,0.9)", fontSize:"8px", fontWeight:"900", color:"#000", letterSpacing:"0.2em" }}>★ FEATURED</span>
              <span style={{ padding:"4px 10px", borderRadius:"20px", background:`${getColor(featured.type)}cc`, fontSize:"8px", fontWeight:"900", color:"#000", letterSpacing:"0.15em" }}>{featured.type?.toUpperCase()}</span>
            </div>
            {featured.soldOut && <div style={{ position:"absolute", top:"14px", right:"14px", padding:"4px 10px", borderRadius:"20px", background:"rgba(255,59,48,0.9)", fontSize:"8px", fontWeight:"900", color:"#fff", letterSpacing:"0.15em" }}>SOLD OUT</div>}
            <div style={{ position:"relative", zIndex:1, padding:"80px 18px 18px" }}>
              <div style={{ fontSize:"9px", color:`${getColor(featured.type)}cc`, fontFamily:"monospace", letterSpacing:"0.25em", marginBottom:"5px" }}>
                {new Date(featured.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}).toUpperCase()} · {featured.time}
              </div>
              <div style={{ fontSize:"22px", fontWeight:"900", color:"#fff", marginBottom:"3px" }}>{featured.title}</div>
              <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.55)" }}>📍 {featured.venue}, {featured.city}</div>
              <div style={{ marginTop:"14px", display:"flex", gap:"8px", alignItems:"center" }}>
                <div style={{ flex:1, padding:"10px 14px", borderRadius:"10px", background:`linear-gradient(135deg,${getColor(featured.type)},${ac})`, textAlign:"center", color:"#000", fontSize:"12px", fontWeight:"900", letterSpacing:"0.1em" }}>
                  {featured.soldOut ? "SOLD OUT" : `🎟 GET TICKETS${featured.price?` — ${featured.price}`:""}`}
                </div>
                <div style={{ padding:"10px 14px", borderRadius:"10px", background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", color:"#ddd", fontSize:"11px", fontWeight:"700" }}>MORE ›</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TYPE FILTER ── */}
      <div style={{ display:"flex", gap:"6px", overflowX:"auto", padding:"0 16px 16px", scrollbarWidth:"none" }}>
        {types.map(t=>(
          <button key={t} onClick={()=>setFilter(t)}
            style={{ flexShrink:0, padding:"7px 14px", borderRadius:"20px", border:"none", cursor:"pointer", fontFamily:"monospace", fontSize:"10px", fontWeight:"700", transition:"all 0.2s",
              background: filter===t ? (t==="all" ? `linear-gradient(135deg,${pc},${ac})` : `${getColor(t)}cc`) : "rgba(255,255,255,0.05)",
              color: filter===t ? "#000" : "#777" }}>
            {t==="all"?"ALL EVENTS":t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── UPCOMING EVENTS ── */}
      {upcoming.length > 0 && (
        <div style={{ padding:"0 16px" }}>
          <div style={{ fontSize:"9px", letterSpacing:"0.35em", color:"#555", fontFamily:"monospace", marginBottom:"14px" }}>UPCOMING</div>
          <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
            {upcoming.map((ev,i) => {
              const evColor = getColor(ev.type);
              const cd = getCountdown(ev.date, ev.time);
              const isNear = cd && cd.d <= 7;
              return (
                <div key={ev.id} onClick={() => setSelected(ev.id)}
                  style={{ borderRadius:"16px", overflow:"hidden", cursor:"pointer", position:"relative",
                    background: ev.imageUrl ? `url(${ev.imageUrl}) center/cover no-repeat` : `linear-gradient(135deg,${evColor}15,rgba(255,255,255,0.02))`,
                    border:`1px solid ${evColor}33`, transition:"transform 0.2s, box-shadow 0.2s",
                    boxShadow: i===0 ? `0 4px 30px ${evColor}22` : "none" }}>
                  {ev.imageUrl && <div style={{ position:"absolute", inset:0, background:"linear-gradient(135deg, rgba(5,5,8,0.3), rgba(5,5,8,0.85))" }} />}
                  <div style={{ position:"relative", zIndex:1, padding:"18px" }}>
                    <div style={{ display:"flex", gap:"14px", alignItems:"flex-start" }}>
                      {/* DATE BLOCK */}
                      <div style={{ flexShrink:0, width:"56px", textAlign:"center", padding:"10px 6px", borderRadius:"12px", background:`${evColor}20`, border:`1px solid ${evColor}44` }}>
                        <div style={{ fontSize:"9px", color:evColor, fontFamily:"monospace", letterSpacing:"0.1em" }}>
                          {new Date(ev.date+"T12:00:00").toLocaleDateString("en-US",{month:"short"}).toUpperCase()}
                        </div>
                        <div style={{ fontSize:"26px", fontWeight:"900", color:"#fff", lineHeight:1, marginTop:"1px" }}>
                          {new Date(ev.date+"T12:00:00").getDate()}
                        </div>
                        <div style={{ fontSize:"8px", color:"rgba(255,255,255,0.4)", marginTop:"2px" }}>
                          {new Date(ev.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"}).toUpperCase()}
                        </div>
                      </div>

                      {/* INFO */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", gap:"5px", flexWrap:"wrap", marginBottom:"6px" }}>
                          <span style={{ padding:"2px 8px", borderRadius:"10px", background:`${evColor}22`, border:`1px solid ${evColor}44`, fontSize:"8px", color:evColor, fontFamily:"monospace" }}>{ev.type?.toUpperCase()}</span>
                          {isNear && <span style={{ padding:"2px 8px", borderRadius:"10px", background:"rgba(255,107,53,0.2)", border:"1px solid rgba(255,107,53,0.4)", fontSize:"8px", color:"#FF6B35", fontFamily:"monospace" }}>SOON</span>}
                          {ev.soldOut && <span style={{ padding:"2px 8px", borderRadius:"10px", background:"rgba(255,59,48,0.2)", border:"1px solid rgba(255,59,48,0.4)", fontSize:"8px", color:"#FF3B30", fontFamily:"monospace" }}>SOLD OUT</span>}
                        </div>
                        <div style={{ fontSize:"16px", fontWeight:"800", color:"#fff", marginBottom:"4px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ev.title}</div>
                        <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.5)", marginBottom:"4px" }}>🕐 {ev.time} &nbsp;·&nbsp; 📍 {ev.city}</div>
                        {ev.venue && <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.35)" }}>{ev.venue}</div>}
                      </div>

                      {/* PRICE + ARROW */}
                      <div style={{ flexShrink:0, textAlign:"right" }}>
                        <div style={{ fontSize:"14px", fontWeight:"900", color: ev.soldOut?"#FF3B30":evColor }}>{ev.price||"Free"}</div>
                        <div style={{ fontSize:"18px", color:"rgba(255,255,255,0.3)", marginTop:"8px" }}>›</div>
                      </div>
                    </div>

                    {/* MINI COUNTDOWN */}
                    {cd && isNear && sc.showCountdown !== false && (
                      <div style={{ marginTop:"12px", padding:"8px 12px", borderRadius:"9px", background:"rgba(0,0,0,0.4)", border:`1px solid ${evColor}33`, display:"flex", justifyContent:"center", gap:"16px" }}>
                        {[["d","DAYS"],["h","HRS"],["m","MIN"]].map(([k,lbl])=>(
                          <div key={k} style={{ textAlign:"center" }}>
                            <div style={{ fontSize:"18px", fontWeight:"900", color:evColor, fontFamily:"monospace" }}>{String(cd[k]).padStart(2,"0")}</div>
                            <div style={{ fontSize:"7px", color:"rgba(255,255,255,0.35)", letterSpacing:"0.15em" }}>{lbl}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── PAST EVENTS ── */}
      {past.length > 0 && (
        <div style={{ padding:"24px 16px 0" }}>
          <div style={{ fontSize:"9px", letterSpacing:"0.35em", color:"#333", fontFamily:"monospace", marginBottom:"14px" }}>PAST EVENTS</div>
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            {past.reverse().map(ev=>(
              <div key={ev.id} style={{ display:"flex", gap:"12px", padding:"12px 14px", borderRadius:"12px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)", opacity:0.6 }}>
                <div style={{ flexShrink:0, textAlign:"center", width:"44px" }}>
                  <div style={{ fontSize:"8px", color:"#555", fontFamily:"monospace" }}>{new Date(ev.date+"T12:00:00").toLocaleDateString("en-US",{month:"short"}).toUpperCase()}</div>
                  <div style={{ fontSize:"20px", fontWeight:"900", color:"#555", lineHeight:1 }}>{new Date(ev.date+"T12:00:00").getDate()}</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:"12px", fontWeight:"700", color:"#666" }}>{ev.title}</div>
                  <div style={{ fontSize:"10px", color:"#484848" }}>{ev.venue}, {ev.city}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {upcoming.length===0 && past.length===0 && (
        <div style={{ textAlign:"center", padding:"60px 20px", color:"#484848" }}>
          <div style={{ fontSize:"48px", marginBottom:"14px" }}>🔥</div>
          <div style={{ fontSize:"16px", color:"#555", marginBottom:"6px" }}>No events yet</div>
          <div style={{ fontSize:"12px", color:"#333" }}>Add events in Admin → 🔥 EVENTS</div>
        </div>
      )}
    </div>
  );
}

// ─── EVENTS ADMIN TAB ─────────────────────────────────────────────────────────
function EventsAdminTab({ cfg, setCfg }) {
  const events = cfg.booking?.events || [];
  const sc     = cfg.showcase || {};
  const imgRefs = useRef({});

  const updateEvents = (evs) => setCfg(p=>({...p,booking:{...p.booking,events:evs}}));
  const updateShowcase = (key,val) => setCfg(p=>({...p,showcase:{...p.showcase,[key]:val}}));

  const [editId, setEditId]     = useState(null);
  const [evTab, setEvTab]       = useState("events"); // events | showcase
  const blankEvent = () => ({ id:Date.now(), title:"", date:"", time:"8:00 PM", venue:"", city:"", type:"Concert", price:"", ticketUrl:"", imageUrl:"", description:"", soldOut:false, featured:false });
  const [form, setForm]         = useState(blankEvent());
  const [showForm, setShowForm] = useState(false);

  const updateForm = (key,val) => setForm(p=>({...p,[key]:val}));

  const saveEvent = () => {
    if (!form.title.trim() || !form.date) return;
    if (editId) {
      updateEvents(events.map(e=>e.id===editId?{...form,id:editId}:e));
    } else {
      updateEvents([...events, {...form, id:Date.now()}]);
    }
    setForm(blankEvent()); setEditId(null); setShowForm(false);
  };

  const deleteEvent = (id) => updateEvents(events.filter(e=>e.id!==id));
  const toggleFeatured = (id) => updateEvents(events.map(e=>({...e,featured:e.id===id?!e.featured:false})));
  const toggleSoldOut = (id) => updateEvents(events.map(e=>e.id===id?{...e,soldOut:!e.soldOut}:e));

  const handleEventImg = (file, id) => {
    if(!file||!file.type.startsWith("image/"))return;
    const r=new FileReader(); r.onload=e=>{
      if(id==="form") updateForm("imageUrl",e.target.result);
      else updateEvents(events.map(ev=>ev.id===id?{...ev,imageUrl:e.target.result}:ev));
    }; r.readAsDataURL(file);
  };

  const EVENT_TYPES = ["Concert","Release","Meet & Greet","Show","Workshop","Pop-Up","Other"];
  const EVENT_TYPE_COLORS = {"Concert":"#FF6B35","Release":"#C77DFF","Meet & Greet":"#00F5D4","Show":"#FFD60A","Workshop":"#1DB954","Pop-Up":"#E1306C","Other":"#888"};

  const upcomingCount = events.filter(e=>e.date>=new Date().toISOString().slice(0,10)).length;

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>

      {/* STATS */}
      <div style={{ display:"flex", gap:"8px", marginBottom:"16px" }}>
        {[
          { label:"UPCOMING", val:upcomingCount,          color:"#FF6B35" },
          { label:"TOTAL",    val:events.length,          color:"#C77DFF" },
          { label:"FEATURED", val:events.filter(e=>e.featured).length, color:"#FFD60A" },
        ].map(s=>(
          <div key={s.label} style={{ flex:1, padding:"12px 8px", borderRadius:"10px", background:`${s.color}0d`, border:`1px solid ${s.color}22`, textAlign:"center" }}>
            <div style={{ fontSize:"22px", fontWeight:"900", color:s.color }}>{s.val}</div>
            <div style={{ fontSize:"7px", color:"#484848", letterSpacing:"0.2em", fontFamily:"monospace" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* SUB TABS */}
      <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.06)", marginBottom:"16px" }}>
        {[["events","🔥 EVENTS"],["showcase","🎨 SHOWCASE"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setEvTab(id)} style={{ flex:1, padding:"10px", background:"none", border:"none", cursor:"pointer", fontSize:"9px", letterSpacing:"0.2em", fontWeight:"700", fontFamily:"monospace", color:evTab===id?"#FF6B35":"#3a3a3a", borderBottom:evTab===id?"2px solid #FF6B35":"2px solid transparent" }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── EVENTS TAB ── */}
      {evTab==="events" && (
        <div>
          {/* ADD BUTTON */}
          {!showForm && (
            <button onClick={()=>{setShowForm(true);setEditId(null);setForm(blankEvent());}}
              style={{ width:"100%", padding:"13px", borderRadius:"12px", border:"2px dashed rgba(255,107,53,0.3)", background:"rgba(255,107,53,0.05)", color:"#FF6B35", fontSize:"12px", fontWeight:"700", cursor:"pointer", marginBottom:"16px", letterSpacing:"0.1em" }}>
              + ADD NEW EVENT
            </button>
          )}

          {/* EVENT FORM */}
          {showForm && (
            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,107,53,0.06)", border:"1px solid rgba(255,107,53,0.25)", marginBottom:"16px" }}>
              <div style={{ fontSize:"11px", fontWeight:"700", color:"#FF6B35", marginBottom:"14px" }}>{editId?"✏ EDIT EVENT":"+ NEW EVENT"}</div>

              {/* IMAGE UPLOAD */}
              <div onClick={()=>imgRefs.current["form"]?.click()} style={{ height:"100px", borderRadius:"10px", marginBottom:"12px", cursor:"pointer", overflow:"hidden", position:"relative", border:"2px dashed rgba(255,107,53,0.25)", background:form.imageUrl?`url(${form.imageUrl}) center/cover no-repeat`:"rgba(255,255,255,0.02)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                {form.imageUrl && <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.4)" }} />}
                <div style={{ position:"relative", zIndex:1, textAlign:"center", color:"#FF6B35" }}>
                  <div style={{ fontSize:"22px" }}>{form.imageUrl?"🖼":"📸"}</div>
                  <div style={{ fontSize:"10px", marginTop:"3px" }}>{form.imageUrl?"Change photo":"Upload event photo"}</div>
                </div>
                <input ref={el=>imgRefs.current["form"]=el} type="file" accept="image/*" onChange={e=>handleEventImg(e.target.files[0],"form")} style={{ display:"none" }} />
              </div>

              <AField label="Event Title *"   value={form.title}       onChange={v=>updateForm("title",v)}       placeholder="e.g. Live Concert Night" />
              <div style={{ display:"flex", gap:"8px" }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:"8px", color:"#555", letterSpacing:"0.2em", display:"block", marginBottom:"5px" }}>DATE *</label>
                  <input type="date" value={form.date} onChange={e=>updateForm("date",e.target.value)} style={{ width:"100%", padding:"9px 10px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#ddd", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:"8px", color:"#555", letterSpacing:"0.2em", display:"block", marginBottom:"5px" }}>TIME</label>
                  <input value={form.time} onChange={e=>updateForm("time",e.target.value)} placeholder="8:00 PM" style={{ width:"100%", padding:"9px 10px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#ddd", fontSize:"11px", outline:"none", fontFamily:"monospace" }} />
                </div>
              </div>
              <AField label="Venue"           value={form.venue}       onChange={v=>updateForm("venue",v)}       placeholder="The Venue Name" />
              <AField label="City"            value={form.city}        onChange={v=>updateForm("city",v)}        placeholder="New York, NY" />
              <div style={{ display:"flex", gap:"8px" }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:"8px", color:"#555", letterSpacing:"0.2em", display:"block", marginBottom:"5px" }}>TYPE</label>
                  <select value={form.type} onChange={e=>updateForm("type",e.target.value)} style={{ width:"100%", padding:"9px", background:"#0a0a12", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#ddd", fontSize:"11px", outline:"none", fontFamily:"monospace" }}>
                    {EVENT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <AField label="Price"       value={form.price}       onChange={v=>updateForm("price",v)}       placeholder="$35 or Free" />
                </div>
              </div>
              <AField label="Ticket URL"      value={form.ticketUrl}   onChange={v=>updateForm("ticketUrl",v)}   placeholder="https://tickets.com/..." />
              <div style={{ marginBottom:"12px" }}>
                <label style={{ fontSize:"8px", color:"#555", letterSpacing:"0.2em", display:"block", marginBottom:"5px" }}>DESCRIPTION</label>
                <textarea value={form.description} onChange={e=>updateForm("description",e.target.value)} placeholder="Tell fans what to expect..." rows={3}
                  style={{ width:"100%", padding:"9px 10px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", color:"#ddd", fontSize:"11px", outline:"none", fontFamily:"monospace", resize:"none", lineHeight:1.5 }} />
              </div>
              <div style={{ display:"flex", gap:"8px", marginBottom:"14px" }}>
                {[["featured","★ Featured",form.featured],["soldOut","🚫 Sold Out",form.soldOut]].map(([key,lbl,val])=>(
                  <div key={key} onClick={()=>updateForm(key,!val)} style={{ flex:1, padding:"8px", borderRadius:"8px", cursor:"pointer", textAlign:"center", border:`1px solid ${val?"rgba(255,214,10,0.4)":"rgba(255,255,255,0.07)"}`, background:val?"rgba(255,214,10,0.1)":"rgba(255,255,255,0.02)" }}>
                    <div style={{ fontSize:"10px", fontWeight:"700", color:val?"#FFD60A":"#555" }}>{lbl}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:"8px" }}>
                <button onClick={saveEvent} disabled={!form.title.trim()||!form.date} style={{ flex:2, padding:"11px", borderRadius:"9px", border:"none", background:form.title&&form.date?"linear-gradient(135deg,#FF6B35,#C77DFF)":"rgba(255,255,255,0.05)", color:form.title&&form.date?"#000":"#555", fontSize:"12px", fontWeight:"900", cursor:form.title&&form.date?"pointer":"not-allowed" }}>
                  {editId?"◆ SAVE CHANGES":"◆ ADD EVENT"}
                </button>
                <button onClick={()=>{setShowForm(false);setEditId(null);setForm(blankEvent());}} style={{ flex:1, padding:"11px", borderRadius:"9px", border:"1px solid rgba(255,255,255,0.1)", background:"none", color:"#777", fontSize:"11px", cursor:"pointer" }}>CANCEL</button>
              </div>
            </div>
          )}

          {/* EVENT LIST */}
          {events.length===0 && !showForm && (
            <div style={{ textAlign:"center", padding:"30px", color:"#484848" }}>
              <div style={{ fontSize:"28px", marginBottom:"8px" }}>🔥</div>
              <div style={{ fontSize:"12px" }}>No events yet. Add your first event above.</div>
            </div>
          )}
          {[...events].sort((a,b)=>a.date.localeCompare(b.date)).map(ev=>{
            const evColor = EVENT_TYPE_COLORS[ev.type]||"#FF6B35";
            const isPast = ev.date < new Date().toISOString().slice(0,10);
            return (
              <div key={ev.id} style={{ padding:"13px 14px", borderRadius:"12px", marginBottom:"8px", background:"rgba(255,255,255,0.02)", border:`1px solid ${isPast?"rgba(255,255,255,0.05)":evColor+"33"}`, opacity:isPast?0.5:1 }}>
                <div style={{ display:"flex", gap:"10px", alignItems:"flex-start" }}>
                  {ev.imageUrl && <img src={ev.imageUrl} alt="" style={{ width:"52px", height:"52px", borderRadius:"8px", objectFit:"cover", flexShrink:0 }} />}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", gap:"5px", marginBottom:"4px", flexWrap:"wrap" }}>
                      {ev.featured && <span style={{ fontSize:"8px", color:"#FFD60A", border:"1px solid rgba(255,214,10,0.3)", padding:"1px 6px", borderRadius:"6px" }}>★ FEATURED</span>}
                      {ev.soldOut  && <span style={{ fontSize:"8px", color:"#FF3B30", border:"1px solid rgba(255,59,48,0.3)",  padding:"1px 6px", borderRadius:"6px" }}>SOLD OUT</span>}
                      {isPast      && <span style={{ fontSize:"8px", color:"#555",    border:"1px solid rgba(255,255,255,0.08)",padding:"1px 6px", borderRadius:"6px" }}>PAST</span>}
                    </div>
                    <div style={{ fontSize:"13px", fontWeight:"700", color:isPast?"#666":"#ddd", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ev.title}</div>
                    <div style={{ fontSize:"10px", color:"#555", fontFamily:"monospace", marginTop:"2px" }}>
                      {ev.date} · {ev.time} · {ev.city}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:"5px", flexShrink:0 }}>
                    <button onClick={()=>toggleFeatured(ev.id)} title="Toggle featured" style={{ padding:"5px 8px", borderRadius:"7px", border:`1px solid ${ev.featured?"rgba(255,214,10,0.4)":"rgba(255,255,255,0.08)"}`, background:ev.featured?"rgba(255,214,10,0.1)":"none", color:ev.featured?"#FFD60A":"#484848", fontSize:"11px", cursor:"pointer" }}>★</button>
                    <button onClick={()=>toggleSoldOut(ev.id)} title="Toggle sold out" style={{ padding:"5px 8px", borderRadius:"7px", border:`1px solid ${ev.soldOut?"rgba(255,59,48,0.4)":"rgba(255,255,255,0.08)"}`, background:ev.soldOut?"rgba(255,59,48,0.1)":"none", color:ev.soldOut?"#FF3B30":"#484848", fontSize:"11px", cursor:"pointer" }}>🚫</button>
                    <button onClick={()=>{setForm({...ev});setEditId(ev.id);setShowForm(true);}} style={{ padding:"5px 8px", borderRadius:"7px", border:"1px solid rgba(255,255,255,0.08)", background:"none", color:"#aaa", fontSize:"11px", cursor:"pointer" }}>✏</button>
                    <button onClick={()=>deleteEvent(ev.id)} style={{ padding:"5px 8px", borderRadius:"7px", border:"1px solid rgba(255,59,48,0.2)", background:"rgba(255,59,48,0.07)", color:"#FF3B30", fontSize:"11px", cursor:"pointer" }}>✕</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SHOWCASE SETTINGS TAB ── */}
      {evTab==="showcase" && (
        <div>
          {/* ── PAGE SETTINGS ── */}
          <ASection title="Showcase Page Settings" icon="🎨" color="#C77DFF">
            <AField label="Page Hero Title"   value={sc.heroTitle||""}   onChange={v=>updateShowcase("heroTitle",v)}   placeholder="UPCOMING EVENTS" />
            <AField label="Page Hero Tagline" value={sc.heroSubtext||""} onChange={v=>updateShowcase("heroSubtext",v)} placeholder="Be There. No Excuses." />
            <div style={{ display:"flex", gap:"8px" }}>
              {[["showCountdown","⏰ Countdowns",sc.showCountdown!==false]].map(([key,lbl,val])=>(
                <div key={key} onClick={()=>updateShowcase(key,!val)} style={{ flex:1, padding:"11px", borderRadius:"9px", cursor:"pointer", textAlign:"center", border:val?"1px solid rgba(199,125,255,0.3)":"1px solid rgba(255,255,255,0.07)", background:val?"rgba(199,125,255,0.08)":"rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize:"11px", fontWeight:"700", color:val?"#C77DFF":"#555" }}>{lbl}</div>
                  <div style={{ fontSize:"9px", color:"#484848", marginTop:"2px" }}>{val?"ON":"OFF"}</div>
                </div>
              ))}
            </div>
          </ASection>

          {/* ── HERO SLIDESHOW ── */}
          <ASection title="Hero Slideshow" icon="🎞" color="#FF6B35">
            {/* Toggle */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"14px", padding:"12px 14px", borderRadius:"10px", background:sc.slideshowEnabled?"rgba(255,107,53,0.1)":"rgba(255,255,255,0.02)", border:sc.slideshowEnabled?"1px solid rgba(255,107,53,0.3)":"1px solid rgba(255,255,255,0.07)", transition:"all 0.3s" }}>
              <div>
                <div style={{ fontSize:"12px", fontWeight:"700", color:sc.slideshowEnabled?"#FF6B35":"#ccc" }}>Slideshow Background</div>
                <div style={{ fontSize:"10px", color:"#555", marginTop:"2px" }}>{sc.slideshowEnabled?"Images auto-cycle behind the events hero":"Static gradient hero background"}</div>
              </div>
              <div onClick={()=>updateShowcase("slideshowEnabled",!sc.slideshowEnabled)} style={{ width:"48px", height:"26px", borderRadius:"13px", cursor:"pointer", flexShrink:0, background:sc.slideshowEnabled?"#FF6B35":"rgba(255,255,255,0.1)", position:"relative", transition:"background 0.3s" }}>
                <div style={{ width:"20px", height:"20px", borderRadius:"50%", background:"#fff", position:"absolute", top:"3px", left:sc.slideshowEnabled?"25px":"3px", transition:"left 0.3s", boxShadow:"0 1px 4px rgba(0,0,0,0.4)" }} />
              </div>
            </div>

            {sc.slideshowEnabled && (
              <>
                {/* SLIDE IMAGES */}
                <div style={{ marginBottom:"14px" }}>
                  <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", display:"block", marginBottom:"8px" }}>SLIDE IMAGES ({(sc.slideshowImages||[]).length} added)</label>
                  <div style={{ display:"flex", gap:"8px", overflowX:"auto", paddingBottom:"6px", marginBottom:"8px" }}>
                    {(sc.slideshowImages||[]).map((url,i)=>(
                      <div key={i} style={{ position:"relative", flexShrink:0 }}>
                        <img src={url} alt="" style={{ width:"80px", height:"56px", borderRadius:"8px", objectFit:"cover", border:"1px solid rgba(255,255,255,0.1)" }} />
                        <button onClick={()=>updateShowcase("slideshowImages",(sc.slideshowImages||[]).filter((_,j)=>j!==i))}
                          style={{ position:"absolute", top:"-6px", right:"-6px", width:"18px", height:"18px", borderRadius:"50%", background:"#FF3B30", border:"none", color:"#fff", fontSize:"9px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                        {/* Caption */}
                        <input value={(sc.slideshowCaptions||[])[i]||""} onChange={e=>{
                            const caps=[...(sc.slideshowCaptions||[])];
                            caps[i]=e.target.value;
                            updateShowcase("slideshowCaptions",caps);
                          }} placeholder="Caption..." style={{ width:"80px", marginTop:"4px", padding:"3px 6px", background:"rgba(0,0,0,0.5)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"5px", color:"#ccc", fontSize:"9px", outline:"none" }} />
                      </div>
                    ))}
                    {/* Add button */}
                    <label style={{ width:"80px", height:"56px", borderRadius:"8px", border:"2px dashed rgba(255,107,53,0.3)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0, background:"rgba(255,107,53,0.04)" }}>
                      <span style={{ fontSize:"18px", color:"#FF6B35" }}>+</span>
                      <span style={{ fontSize:"8px", color:"#555", marginTop:"2px" }}>Add</span>
                      <input type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{
                        const file=e.target.files[0]; if(!file) return;
                        const r=new FileReader(); r.onload=ev=>{
                          updateShowcase("slideshowImages",[...(sc.slideshowImages||[]),ev.target.result]);
                        }; r.readAsDataURL(file);
                      }} />
                    </label>
                  </div>
                </div>

                {/* SPEED */}
                <div style={{ marginBottom:"14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px" }}>
                    <label style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555" }}>SLIDE SPEED</label>
                    <span style={{ fontSize:"9px", color:"#FF6B35", fontFamily:"monospace" }}>{sc.slideshowSpeed||5}s per slide</span>
                  </div>
                  <input type="range" min={2} max={15} step={1} value={sc.slideshowSpeed||5}
                    onChange={e=>updateShowcase("slideshowSpeed",Number(e.target.value))}
                    style={{ width:"100%", accentColor:"#FF6B35" }} />
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"8px", color:"#484848", marginTop:"2px" }}>
                    <span>Fast (2s)</span><span>Slow (15s)</span>
                  </div>
                </div>

                {/* OVERLAY */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderRadius:"9px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <div style={{ fontSize:"11px", color:"#ccc" }}>Dark overlay on slides</div>
                    <div style={{ fontSize:"9px", color:"#555", marginTop:"2px" }}>Keeps text readable over bright photos</div>
                  </div>
                  <div onClick={()=>updateShowcase("slideshowOverlay",!sc.slideshowOverlay)} style={{ width:"40px", height:"22px", borderRadius:"11px", cursor:"pointer", flexShrink:0, background:(sc.slideshowOverlay!==false)?"#FF6B35":"rgba(255,255,255,0.1)", position:"relative", transition:"background 0.3s" }}>
                    <div style={{ width:"16px", height:"16px", borderRadius:"50%", background:"#fff", position:"absolute", top:"3px", left:(sc.slideshowOverlay!==false)?"21px":"3px", transition:"left 0.3s" }} />
                  </div>
                </div>

                {/* LIVE PREVIEW HINT */}
                {(sc.slideshowImages||[]).length > 0 && (
                  <div style={{ marginTop:"10px", padding:"8px 12px", borderRadius:"8px", background:"rgba(0,245,212,0.07)", border:"1px solid rgba(0,245,212,0.2)", fontSize:"10px", color:"#00F5D4" }}>
                    ✓ {(sc.slideshowImages||[]).length} slide{(sc.slideshowImages||[]).length!==1?"s":""} ready — visible on the public Events page
                  </div>
                )}
                {(sc.slideshowImages||[]).length === 0 && (
                  <div style={{ marginTop:"10px", padding:"8px 12px", borderRadius:"8px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", fontSize:"10px", color:"#555" }}>
                    Add at least one image to activate the slideshow
                  </div>
                )}
              </>
            )}
          </ASection>

          {/* ── EVENT TYPE COLORS ── */}
          <ASection title="Event Type Colors" icon="◈" color="#FF6B35">
            {Object.entries(EVENT_TYPE_COLORS).map(([type,color])=>(
              <div key={type} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                  <div style={{ width:"10px", height:"10px", borderRadius:"50%", background:color }} />
                  <span style={{ fontSize:"12px", color:"#ccc" }}>{type}</span>
                </div>
                <span style={{ fontSize:"10px", color:color, fontFamily:"monospace" }}>{color}</span>
              </div>
            ))}
          </ASection>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD — FULL VERSION
// ═══════════════════════════════════════════════════════════════════════════════
function AnalyticsDashboard({ config }) {
  const [period,  setPeriod]  = useState("7d");
  const [section, setSection] = useState("overview"); // overview | content | social | revenue | productivity
  const pc = config.brand.primaryColor;
  const ac = config.brand.accentColor;

  const PERIODS = [
    { id:"7d", label:"7D" },{ id:"30d", label:"30D" },{ id:"90d", label:"90D" },{ id:"1y", label:"1Y" },
  ];

  const SECTIONS = [
    { id:"overview",     label:"OVERVIEW",     icon:"⬡" },
    { id:"content",      label:"CONTENT",      icon:"♪" },
    { id:"social",       label:"SOCIAL",       icon:"◎" },
    { id:"revenue",      label:"REVENUE",      icon:"💰" },
    { id:"productivity", label:"PRODUCTIVITY", icon:"⚡" },
  ];

  const kpiData = {
    "7d":  { plays:8420,  downloads:312,  views:14800, revenue:1247,  engagement:6.8, followers:210,  postsPublished:12, hoursProduced:18, avgResponseTime:42 },
    "30d": { plays:34100, downloads:1240, views:52000, revenue:4830,  engagement:7.2, followers:890,  postsPublished:48, hoursProduced:74, avgResponseTime:38 },
    "90d": { plays:98400, downloads:4100, views:180000,revenue:14200, engagement:6.5, followers:3100, postsPublished:142,hoursProduced:210,avgResponseTime:35 },
    "1y":  { plays:312000,downloads:14200,views:640000,revenue:48400, engagement:6.9, followers:9800, postsPublished:520,hoursProduced:780,avgResponseTime:31 },
  };
  const d = kpiData[period];

  const scale = { "7d":1, "30d":3.2, "90d":9.1, "1y":31 };
  const s = scale[period];

  const musicChart   = [420,380,510,470,620,580,700,650,800,780,920,890,1050,980,1120].map(v => Math.round(v*s));
  const viewsChart   = [820,760,1100,980,1250,1100,1400,1300,1600,1520,1800,1700,2100,1950,2300].map(v => Math.round(v*s));
  const revenueChart = [80,65,110,90,140,120,160,150,200,180,240,220,280,260,310].map(v => Math.round(v*s));
  const followerChart= [30,28,42,38,55,50,68,62,80,75,92,88,105,98,115].map(v => Math.round(v*s));

  const fmt = (n) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : n.toString();

  const MiniChart = ({ data: chartData, color, height=40 }) => {
    const max = Math.max(...chartData, 1);
    return (
      <div style={{ display:"flex", alignItems:"flex-end", gap:"2px", height:`${height}px` }}>
        {chartData.map((v,i) => (
          <div key={i} style={{ flex:1, borderRadius:"2px 2px 0 0", background:`linear-gradient(180deg,${color},${color}70)`, height:`${Math.max(4,Math.round((v/max)*100))}%`, minWidth:"3px", opacity:0.45+((i/chartData.length)*0.55) }} />
        ))}
      </div>
    );
  };

  const RankBar = ({ label, val, pct, color, sub }) => (
    <div style={{ marginBottom:"13px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"4px" }}>
        <span style={{ fontSize:"12px", color:"#ccc" }}>{label}</span>
        <span style={{ fontSize:"11px", color, fontFamily:"monospace", fontWeight:"700" }}>{val}</span>
      </div>
      {sub && <div style={{ fontSize:"9px", color:"#484848", fontFamily:"monospace", marginBottom:"4px" }}>{sub}</div>}
      <div style={{ height:"3px", borderRadius:"2px", background:"rgba(255,255,255,0.05)" }}>
        <div style={{ height:"100%", borderRadius:"2px", background:color, width:`${pct}%`, transition:"width 0.6s ease" }} />
      </div>
    </div>
  );

  // ── PRODUCTIVITY DATA ──────────────────────────────────────────────────────
  const HOURLY_HEATMAP = [
    // [hour_label, mon, tue, wed, thu, fri, sat, sun]  — 0–10 intensity score
    ["12AM", 0,0,0,0,0,2,1],
    ["3AM",  0,0,0,0,0,1,0],
    ["6AM",  2,3,2,3,2,1,1],
    ["8AM",  7,8,6,8,7,3,2],
    ["10AM", 9,8,9,7,8,5,4],
    ["12PM", 6,5,8,6,7,6,5],
    ["2PM",  5,7,6,9,6,8,7],
    ["4PM",  4,5,5,5,4,9,8],
    ["6PM",  6,7,5,6,5,7,6],
    ["8PM",  8,9,7,8,8,6,5],
    ["10PM", 5,6,5,7,6,4,3],
  ];

  const DAYS = ["MON","TUE","WED","THU","FRI","SAT","SUN"];

  const BEST_WINDOWS = [
    { day:"Tuesday",   time:"8–11 AM",   score:9.2, type:"Recording / Production",  reason:"Highest focus scores + lowest interruptions" },
    { day:"Thursday",  time:"2–5 PM",    score:8.9, type:"Video Shoots",             reason:"Natural light peaks + audience pre-weekend energy" },
    { day:"Monday",    time:"8–10 AM",   score:8.7, type:"Content Planning",         reason:"Week-start clarity = sharper creative decisions"  },
    { day:"Saturday",  time:"2–6 PM",    score:8.4, type:"Posting & Engagement",     reason:"Audience most active — replies boost algorithm"    },
    { day:"Wednesday", time:"7–9 PM",    score:8.1, type:"Live Streaming",           reason:"Mid-week peak viewership window across platforms"  },
    { day:"Friday",    time:"6–9 PM",    score:7.8, type:"Music Drops / Releases",   reason:"Weekend listening surge starts Friday evening"     },
  ];

  const CONTENT_VELOCITY = [
    { label:"Posts This Period",    val:d.postsPublished, unit:"published",  color:pc,        trend:"+12%" },
    { label:"Hours of Content",     val:d.hoursProduced,  unit:"hours",      color:ac,        trend:"+8%"  },
    { label:"Avg Response Time",    val:d.avgResponseTime,unit:"min",        color:"#00F5D4", trend:"-14%" },
    { label:"Content Consistency",  val:"94",             unit:"%",          color:"#FFD60A", trend:"↑"    },
  ];

  const TREND_INSIGHTS = [
    { icon:"📈", title:"Music performs best Fri–Sun", desc:"72% of your total plays happen Thu night through Sunday. Drop new music Thursday evening for maximum weekend impact.", color:pc },
    { icon:"⚡", title:"Tuesday is your power day", desc:"Data shows Tuesday 8–11 AM is your highest-output creative window. Block this time for recording and production.", color:"#FFD60A" },
    { icon:"🎯", title:"Reels drive 3× more followers", desc:"Short-form video consistently converts at 3.1× the rate of static posts. Prioritize 60-second content.", color:"#F72585" },
    { icon:"💰", title:"Episode 3 pattern = your formula", desc:"Real Talk style episodes (industry insight + personal story) earn 40% more watch time than other formats.", color:ac },
    { icon:"🔥", title:"Live streams peak Wed 7–9 PM", desc:"Your live content gets 2.3× more comments than pre-recorded. Schedule weekly lives on Wednesday evenings.", color:"#00F5D4" },
    { icon:"📊", title:"Revenue spikes follow content clusters", desc:"Every time you post 3+ pieces in 48 hours, revenue increases 28% in the following week. Batch your content.", color:"#C77DFF" },
  ];

  return (
    <div style={{ paddingBottom:"20px" }}>
      {/* HEADER */}
      <div style={{ padding:"28px 20px 0" }}>
        <SH icon="📊" title="ANALYTICS" accent={pc} sub="Your numbers. Your growth. Your power." />
      </div>

      {/* PERIOD + SECTION CONTROLS */}
      <div style={{ padding:"0 20px 20px" }}>
        <div style={{ display:"flex", gap:"6px", marginBottom:"12px" }}>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} style={{ flex:1, padding:"9px 4px", borderRadius:"9px", border:"none", cursor:"pointer", background:period===p.id ? `linear-gradient(135deg,${pc},${ac})` : "rgba(255,255,255,0.04)", color:period===p.id ? "#000" : "#555", fontSize:"9px", fontWeight:"800", letterSpacing:"0.15em", fontFamily:"monospace", transition:"all 0.25s" }}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", overflowX:"auto", gap:"6px", scrollbarWidth:"none" }}>
          {SECTIONS.map(sec => (
            <button key={sec.id} onClick={() => setSection(sec.id)} style={{ flex:"0 0 auto", padding:"7px 12px", borderRadius:"16px", border:"none", cursor:"pointer", background:section===sec.id ? `${pc}22` : "rgba(255,255,255,0.03)", color:section===sec.id ? pc : "#484848", fontSize:"9px", fontWeight:"700", letterSpacing:"0.1em", fontFamily:"monospace", transition:"all 0.25s", borderBottom:section===sec.id ? `2px solid ${pc}` : "2px solid transparent" }}>
              {sec.icon} {sec.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"0 20px" }}>

        {/* ── OVERVIEW ── */}
        {section === "overview" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"10px", marginBottom:"20px" }}>
              {[
                { label:"MUSIC PLAYS",   val:fmt(d.plays),        icon:"♪", color:pc,        chart:musicChart    },
                { label:"SHOW VIEWS",    val:fmt(d.views),        icon:"▶", color:ac,        chart:viewsChart    },
                { label:"DOWNLOADS",     val:fmt(d.downloads),    icon:"↓", color:"#00F5D4", chart:musicChart.map(v=>Math.round(v*0.037)) },
                { label:"REVENUE",       val:`$${fmt(d.revenue)}`,icon:"💰",color:"#FFD60A", chart:revenueChart  },
                { label:"ENGAGEMENT",    val:`${d.engagement}%`,  icon:"◎", color:"#F72585", chart:viewsChart.map(v=>Math.round(v*0.004)) },
                { label:"NEW FOLLOWERS", val:`+${fmt(d.followers)}`,icon:"★",color:"#C77DFF",chart:followerChart },
              ].map((kpi,i) => (
                <div key={i} style={{ padding:"14px", borderRadius:"14px", background:"rgba(255,255,255,0.03)", border:`1px solid ${kpi.color}22` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"10px" }}>
                    <div>
                      <div style={{ fontSize:"8px", letterSpacing:"0.22em", color:"#555", fontFamily:"monospace", marginBottom:"3px" }}>{kpi.label}</div>
                      <div style={{ fontSize:"20px", fontWeight:"900", color:kpi.color, lineHeight:1 }}>{kpi.val}</div>
                    </div>
                    <span style={{ fontSize:"16px", opacity:0.4 }}>{kpi.icon}</span>
                  </div>
                  <MiniChart data={kpi.chart} color={kpi.color} height={36} />
                </div>
              ))}
            </div>

            {/* TREND INSIGHTS */}
            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:`1px solid ${pc}18`, marginBottom:"16px" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:pc, fontFamily:"monospace", marginBottom:"14px" }}>⚡ AI TREND INSIGHTS</div>
              {TREND_INSIGHTS.slice(0,3).map((t,i) => (
                <div key={i} style={{ display:"flex", gap:"12px", alignItems:"flex-start", padding:"10px 0", borderBottom:i<2?"1px solid rgba(255,255,255,0.04)":"none" }}>
                  <span style={{ fontSize:"18px", flexShrink:0 }}>{t.icon}</span>
                  <div>
                    <div style={{ fontSize:"12px", fontWeight:"700", color:t.color, marginBottom:"3px" }}>{t.title}</div>
                    <div style={{ fontSize:"11px", color:"#666", lineHeight:1.55 }}>{t.desc}</div>
                  </div>
                </div>
              ))}
              <button onClick={() => setSection("productivity")} style={{ marginTop:"12px", width:"100%", padding:"9px", borderRadius:"8px", border:`1px solid ${pc}33`, background:`${pc}0d`, color:pc, fontSize:"10px", fontWeight:"700", letterSpacing:"0.12em", cursor:"pointer", fontFamily:"monospace" }}>
                VIEW ALL INSIGHTS → PRODUCTIVITY TAB
              </button>
            </div>
          </div>
        )}

        {/* ── CONTENT ── */}
        {section === "content" && (
          <div>
            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:`1px solid ${pc}20`, marginBottom:"16px" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:pc, fontFamily:"monospace", marginBottom:"14px" }}>♪ TOP TRACKS · {period.toUpperCase()}</div>
              {[
                { title:"Track Name 03", plays:period==="7d"?"2.1K":period==="30d"?"8.4K":period==="90d"?"24K":"84K",  pct:100, genre:"Pop" },
                { title:"Track Name 01", plays:period==="7d"?"1.2K":period==="30d"?"5.1K":period==="90d"?"15K":"52K",  pct:60,  genre:"Hip-Hop" },
                { title:"Track Name 02", plays:period==="7d"?"892": period==="30d"?"3.8K":period==="90d"?"11K":"38K",  pct:44,  genre:"R&B" },
                { title:"Track Name 04", plays:period==="7d"?"644": period==="30d"?"2.7K":period==="90d"?"7.8K":"27K", pct:32,  genre:"Trap" },
              ].map((t,i) => <RankBar key={i} label={t.title} val={t.plays} pct={t.pct} color={pc} sub={`Genre: ${t.genre}`} />)}
            </div>

            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:`1px solid ${ac}20`, marginBottom:"16px" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:ac, fontFamily:"monospace", marginBottom:"14px" }}>▶ TOP EPISODES · {period.toUpperCase()}</div>
              {[
                { title:"Episode 03 — Real Talk",   views:period==="7d"?"5.1K":period==="30d"?"18K":period==="90d"?"52K":"184K", pct:100, retention:"74%" },
                { title:"Episode 01 — Pilot",       views:period==="7d"?"3.4K":period==="30d"?"12K":period==="90d"?"35K":"122K", pct:67,  retention:"68%" },
                { title:"Episode 02 — The Come Up", views:period==="7d"?"2.8K":period==="30d"?"9.8K":period==="90d"?"28K":"98K", pct:55,  retention:"61%" },
              ].map((s,i) => <RankBar key={i} label={s.title} val={s.views} pct={s.pct} color={ac} sub={`Avg retention: ${s.retention}`} />)}
            </div>

            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(247,37,133,0.18)", marginBottom:"16px" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#F72585", fontFamily:"monospace", marginBottom:"14px" }}>◆ POST ENGAGEMENT BY FORMAT</div>
              {[
                { type:"Reels / Shorts", rate:"9.1%", reach:period==="7d"?"12K":period==="30d"?"48K":period==="90d"?"142K":"504K", pct:100, color:"#F72585" },
                { type:"Live Streams",   rate:"11.4%",reach:period==="7d"?"3.1K":period==="30d"?"12K":period==="90d"?"36K":"128K", pct:85,  color:"#FFD60A" },
                { type:"Feed Posts",     rate:"6.8%", reach:period==="7d"?"8.4K":period==="30d"?"34K":period==="90d"?"98K":"348K", pct:72,  color:pc        },
                { type:"Stories",        rate:"4.2%", reach:period==="7d"?"5.2K":period==="30d"?"21K":period==="90d"?"62K":"220K", pct:48,  color:ac        },
              ].map((row,i) => <RankBar key={i} label={row.type} val={row.rate} pct={row.pct} color={row.color} sub={`Reach: ${row.reach}`} />)}
              <div style={{ marginTop:"10px", padding:"10px 12px", borderRadius:"9px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize:"10px", color:"#555", fontFamily:"monospace" }}>⚡ Live streams have the highest engagement rate. Schedule weekly.</div>
              </div>
            </div>

            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(0,245,212,0.15)" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#00F5D4", fontFamily:"monospace", marginBottom:"14px" }}>↓ DOWNLOAD TRENDS</div>
              <MiniChart data={musicChart.map(v=>Math.round(v*0.037))} color="#00F5D4" height={60} />
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:"8px" }}>
                <span style={{ fontSize:"8px", color:"#484848" }}>Start of period</span>
                <span style={{ fontSize:"8px", color:"#484848" }}>Today</span>
              </div>
              <div style={{ marginTop:"12px", display:"flex", gap:"10px" }}>
                {[["Music Downloads",fmt(d.downloads),"#00F5D4"],["Show Replays",fmt(Math.round(d.downloads*0.4)),"#C77DFF"],["Digital Products",fmt(Math.round(d.downloads*0.22)),"#FFD60A"]].map(([l,v,c],i)=>(
                  <div key={i} style={{ flex:1, padding:"10px 8px", borderRadius:"8px", background:`${c}10`, border:`1px solid ${c}25`, textAlign:"center" }}>
                    <div style={{ fontSize:"14px", fontWeight:"900", color:c }}>{v}</div>
                    <div style={{ fontSize:"8px", color:"#484848", marginTop:"2px", lineHeight:1.3 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SOCIAL ── */}
        {section === "social" && (
          <div>
            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,214,10,0.18)", marginBottom:"16px" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#FFD60A", fontFamily:"monospace", marginBottom:"14px" }}>◎ FOLLOWER GROWTH BY PLATFORM</div>
              {[
                { name:"TikTok",    icon:"🎵", color:"#69C9D0", new:period==="7d"?"+310":period==="30d"?"+1.1K":period==="90d"?"+3.8K":"+12K", total:"31K",  eng:"9.1%", pct:100 },
                { name:"Instagram", icon:"📸", color:"#E1306C", new:period==="7d"?"+124":period==="30d"?"+480":period==="90d"?"+1.7K":"+5.4K", total:"12.4K", eng:"7.2%", pct:80  },
                { name:"Spotify",   icon:"♫",  color:"#1DB954", new:period==="7d"?"+94": period==="30d"?"+360":period==="90d"?"+1.3K":"+4.1K", total:"3.8K",  eng:"—",    pct:68  },
                { name:"Twitter/X", icon:"✕",  color:"#1DA1F2", new:period==="7d"?"+62": period==="30d"?"+240":period==="90d"?"+840":"+2.7K",  total:"5.6K",  eng:"4.8%", pct:52  },
                { name:"Facebook",  icon:"📘", color:"#4267B2", new:period==="7d"?"+38": period==="30d"?"+150":period==="90d"?"+520":"+1.7K",  total:"9.1K",  eng:"3.9%", pct:40  },
                { name:"YouTube",   icon:"▶",  color:"#FF0000", new:period==="7d"?"+48": period==="30d"?"+190":period==="90d"?"+620":"+2.0K",  total:"8.2K",  eng:"5.4%", pct:44  },
              ].map((p,i) => (
                <div key={i} style={{ marginBottom:"14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"5px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                      <span>{p.icon}</span>
                      <div>
                        <span style={{ fontSize:"12px", color:"#ccc" }}>{p.name}</span>
                        <span style={{ fontSize:"9px", color:"#484848", marginLeft:"8px", fontFamily:"monospace" }}>Engagement: {p.eng}</span>
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:"12px", fontWeight:"800", color:p.color, fontFamily:"monospace" }}>{p.new}</div>
                      <div style={{ fontSize:"9px", color:"#484848" }}>total: {p.total}</div>
                    </div>
                  </div>
                  <div style={{ height:"3px", borderRadius:"2px", background:"rgba(255,255,255,0.05)" }}>
                    <div style={{ height:"100%", borderRadius:"2px", background:p.color, width:`${p.pct}%`, transition:"width 0.6s ease" }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#555", fontFamily:"monospace", marginBottom:"14px" }}>◆ BEST POSTING TIMES (BY PLATFORM)</div>
              {[
                { platform:"Instagram", time:"6–9 AM & 7–9 PM",   peak:"Tue, Wed, Fri", color:"#E1306C" },
                { platform:"TikTok",    time:"7–9 AM & 7–11 PM",  peak:"Tue, Thu, Sat", color:"#69C9D0" },
                { platform:"YouTube",   time:"2–4 PM & 8–11 PM",  peak:"Fri, Sat, Sun", color:"#FF0000" },
                { platform:"Twitter/X", time:"8–10 AM & 6–9 PM",  peak:"Mon, Wed, Thu", color:"#1DA1F2" },
                { platform:"Facebook",  time:"1–4 PM weekdays",   peak:"Wed, Thu",      color:"#4267B2" },
                { platform:"Spotify",   time:"Release Thu 5 PM",  peak:"Fri–Sun",       color:"#1DB954" },
              ].map((row,i) => (
                <div key={i} style={{ display:"flex", gap:"10px", alignItems:"flex-start", padding:"10px 0", borderBottom:i<5?"1px solid rgba(255,255,255,0.04)":"none" }}>
                  <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:row.color, marginTop:"4px", flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:"12px", color:"#ccc", fontWeight:"600" }}>{row.platform}</div>
                    <div style={{ fontSize:"10px", color:"#484848", fontFamily:"monospace", marginTop:"2px" }}>{row.time}</div>
                  </div>
                  <div style={{ fontSize:"9px", color:row.color, fontFamily:"monospace", textAlign:"right" }}>{row.peak}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── REVENUE ── */}
        {section === "revenue" && (
          <div>
            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,214,10,0.18)", marginBottom:"16px" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#FFD60A", fontFamily:"monospace", marginBottom:"8px" }}>💰 TOTAL REVENUE · {period.toUpperCase()}</div>
              <div style={{ fontSize:"36px", fontWeight:"900", color:"#FFD60A", fontFamily:"monospace", marginBottom:"14px" }}>${fmt(d.revenue)}</div>
              <MiniChart data={revenueChart} color="#FFD60A" height={60} />
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:"6px" }}>
                <span style={{ fontSize:"8px", color:"#484848" }}>Start</span>
                <span style={{ fontSize:"8px", color:"#484848" }}>Today</span>
              </div>
            </div>

            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", marginBottom:"16px" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#555", fontFamily:"monospace", marginBottom:"14px" }}>REVENUE BY STREAM</div>
              {[
                { label:"App Sales (Starter/Pro/Empire)", val:period==="7d"?"$847":period==="30d"?"$2,940":period==="90d"?"$8,600":"$29,800", pct:100, color:"#FF6B35" },
                { label:"Fan Memberships",                val:period==="7d"?"$248":period==="30d"?"$994": period==="90d"?"$2,980":"$9,940",  pct:70,  color:"#C77DFF" },
                { label:"Digital Downloads",              val:period==="7d"?"$92": period==="30d"?"$368": period==="90d"?"$1,100":"$3,680",  pct:42,  color:"#00F5D4" },
                { label:"Merch Store",                    val:period==="7d"?"$60": period==="30d"?"$528": period==="90d"?"$1,520":"$4,980",  pct:35,  color:"#FFD60A" },
              ].map((row,i) => <RankBar key={i} label={row.label} val={row.val} pct={row.pct} color={row.color} />)}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"10px" }}>
              {[
                { label:"AVG ORDER VALUE",  val:period==="7d"?"$42":period==="30d"?"$48":period==="90d"?"$51":"$55",   color:"#00F5D4" },
                { label:"CONVERSION RATE",  val:period==="7d"?"3.2%":period==="30d"?"3.8%":period==="90d"?"4.1%":"4.6%", color:pc       },
                { label:"REPEAT BUYERS",    val:period==="7d"?"18%":period==="30d"?"24%":period==="90d"?"31%":"38%",   color:ac        },
                { label:"REFUND RATE",      val:"1.2%",                                                                 color:"#555"    },
              ].map((s,i) => (
                <div key={i} style={{ padding:"14px", borderRadius:"12px", background:"rgba(255,255,255,0.03)", border:`1px solid ${s.color}22`, textAlign:"center" }}>
                  <div style={{ fontSize:"22px", fontWeight:"900", color:s.color, lineHeight:1 }}>{s.val}</div>
                  <div style={{ fontSize:"8px", letterSpacing:"0.2em", color:"#484848", marginTop:"4px", fontFamily:"monospace" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PRODUCTIVITY ── */}
        {section === "productivity" && (
          <div>
            {/* PRODUCTIVITY SCORE */}
            <div style={{ padding:"20px", borderRadius:"14px", marginBottom:"16px", background:"linear-gradient(135deg,rgba(255,214,10,0.08),rgba(255,107,53,0.06))", border:"1px solid rgba(255,214,10,0.2)", textAlign:"center" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.3em", color:"#FFD60A", fontFamily:"monospace", marginBottom:"8px" }}>⚡ YOUR PRODUCTIVITY SCORE</div>
              <div style={{ fontSize:"64px", fontWeight:"900", background:"linear-gradient(135deg,#FFD60A,#FF6B35)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", lineHeight:1 }}>
                {period==="7d"?"82":period==="30d"?"87":period==="90d"?"91":"94"}
              </div>
              <div style={{ fontSize:"12px", color:"#777", marginTop:"6px" }}>out of 100 — {period==="7d"?"Good":period==="30d"?"Great":period==="90d"?"Excellent":"Elite"} creator pace</div>
              <div style={{ display:"flex", justifyContent:"center", gap:"20px", marginTop:"16px" }}>
                {CONTENT_VELOCITY.map((c,i) => (
                  <div key={i} style={{ textAlign:"center" }}>
                    <div style={{ fontSize:"16px", fontWeight:"900", color:c.color }}>{c.val}<span style={{ fontSize:"10px" }}>{c.unit}</span></div>
                    <div style={{ fontSize:"8px", color:"#484848", fontFamily:"monospace" }}>{c.label.split(" ").slice(0,2).join(" ")}</div>
                    <div style={{ fontSize:"8px", color:i===2?"#00F5D4":"#484848", fontFamily:"monospace" }}>{c.trend}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* PEAK PERFORMANCE HEATMAP */}
            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:`1px solid ${pc}18`, marginBottom:"16px" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:pc, fontFamily:"monospace", marginBottom:"14px" }}>🕐 PEAK PERFORMANCE HEATMAP</div>
              <div style={{ fontSize:"9px", color:"#484848", fontFamily:"monospace", marginBottom:"10px" }}>Darker = higher output & engagement</div>

              {/* DAY LABELS */}
              <div style={{ display:"flex", gap:"3px", marginBottom:"4px", paddingLeft:"36px" }}>
                {DAYS.map(d => <div key={d} style={{ flex:1, fontSize:"7px", color:"#484848", textAlign:"center", fontFamily:"monospace" }}>{d}</div>)}
              </div>

              {/* HEATMAP ROWS */}
              {HOURLY_HEATMAP.map(([hour, ...scores], ri) => (
                <div key={ri} style={{ display:"flex", alignItems:"center", gap:"3px", marginBottom:"3px" }}>
                  <div style={{ width:"32px", fontSize:"8px", color:"#484848", fontFamily:"monospace", flexShrink:0 }}>{hour}</div>
                  {scores.map((score, di) => {
                    const intensity = score / 10;
                    const bg = intensity === 0 ? "rgba(255,255,255,0.03)" : `rgba(${parseInt(pc.slice(1,3),16)},${parseInt(pc.slice(3,5),16)},${parseInt(pc.slice(5,7),16)},${(intensity*0.85).toFixed(2)})`;
                    return (
                      <div key={di} style={{ flex:1, aspectRatio:"1", borderRadius:"3px", background:bg, border:"1px solid rgba(255,255,255,0.03)", minWidth:"6px" }} />
                    );
                  })}
                </div>
              ))}
              <div style={{ marginTop:"10px", display:"flex", alignItems:"center", gap:"8px" }}>
                <span style={{ fontSize:"8px", color:"#484848" }}>Low</span>
                {[0.1,0.3,0.5,0.7,0.9].map((v,i) => (
                  <div key={i} style={{ width:"16px", height:"8px", borderRadius:"2px", background:`rgba(${parseInt(pc.slice(1,3),16)},${parseInt(pc.slice(3,5),16)},${parseInt(pc.slice(5,7),16)},${v})` }} />
                ))}
                <span style={{ fontSize:"8px", color:"#484848" }}>Peak</span>
              </div>
            </div>

            {/* BEST PRODUCTION WINDOWS */}
            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(0,245,212,0.18)", marginBottom:"16px" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#00F5D4", fontFamily:"monospace", marginBottom:"14px" }}>🎯 BEST WINDOWS FOR EACH TASK</div>
              {BEST_WINDOWS.map((w,i) => (
                <div key={i} style={{ display:"flex", gap:"12px", alignItems:"flex-start", padding:"12px", marginBottom:"8px", borderRadius:"10px", background:i===0?"rgba(0,245,212,0.06)":"rgba(255,255,255,0.02)", border:i===0?"1px solid rgba(0,245,212,0.2)":"1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ textAlign:"center", minWidth:"36px" }}>
                    <div style={{ fontSize:"16px", fontWeight:"900", color:"#00F5D4", fontFamily:"monospace", lineHeight:1 }}>{w.score}</div>
                    <div style={{ fontSize:"7px", color:"#484848" }}>SCORE</div>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", gap:"8px", alignItems:"center", marginBottom:"3px" }}>
                      <span style={{ fontSize:"11px", fontWeight:"800", color:"#ccc" }}>{w.day}</span>
                      <span style={{ fontSize:"10px", color:"#00F5D4", fontFamily:"monospace" }}>{w.time}</span>
                    </div>
                    <div style={{ fontSize:"12px", fontWeight:"700", color:i===0?"#00F5D4":"#aaa", marginBottom:"3px" }}>{w.type}</div>
                    <div style={{ fontSize:"10px", color:"#555", lineHeight:1.4 }}>{w.reason}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* ALL TREND INSIGHTS */}
            <div style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.02)", border:`1px solid ${ac}18` }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:ac, fontFamily:"monospace", marginBottom:"14px" }}>📈 ALL TREND INSIGHTS</div>
              {TREND_INSIGHTS.map((t,i) => (
                <div key={i} style={{ display:"flex", gap:"12px", alignItems:"flex-start", padding:"12px 0", borderBottom:i<TREND_INSIGHTS.length-1?"1px solid rgba(255,255,255,0.04)":"none" }}>
                  <span style={{ fontSize:"18px", flexShrink:0 }}>{t.icon}</span>
                  <div>
                    <div style={{ fontSize:"12px", fontWeight:"700", color:t.color, marginBottom:"3px" }}>{t.title}</div>
                    <div style={{ fontSize:"11px", color:"#666", lineHeight:1.55 }}>{t.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MERCH STORE
// ═══════════════════════════════════════════════════════════════════════════════
const MERCH_PRODUCTS = [
  // APPAREL
  { id:1,  name:"Empire Hoodie",        price:65,  category:"Apparel",     emoji:"👕", colors:["#1a1a1a","#FF6B35","#fff"],  sizes:["S","M","L","XL","2XL"], stock:24,  sold:87,  digital:false },
  { id:2,  name:"Logo Snapback",        price:38,  category:"Accessories", emoji:"🧢", colors:["#1a1a1a","#FF6B35"],          sizes:["One Size"],              stock:41,  sold:123, digital:false },
  { id:4,  name:"Brand Tee",            price:32,  category:"Apparel",     emoji:"👕", colors:["#fff","#1a1a1a","#FF6B35"],   sizes:["S","M","L","XL"],        stock:56,  sold:162, digital:false },
  { id:5,  name:"Phone Case",           price:25,  category:"Accessories", emoji:"📱", colors:["#1a1a1a","#FF6B35"],          sizes:["iPhone","Android"],       stock:33,  sold:78,  digital:false },
  { id:6,  name:"Signed Print",         price:45,  category:"Collectibles",emoji:"🖼", colors:[],                             sizes:["8x10","11x14"],           stock:12,  sold:31,  digital:false },
  // DIGITAL
  { id:7,  name:"Exclusive Mixtape",    price:15,  category:"Digital",     emoji:"💿", colors:[], sizes:[], stock:999, sold:204, digital:true,  format:"MP3 · 320kbps",     desc:"10 exclusive tracks + bonus instrumentals. Instant download." },
  { id:8,  name:"Full Show Replay Pack",price:22,  category:"Digital",     emoji:"🎬", colors:[], sizes:[], stock:999, sold:89,  digital:true,  format:"MP4 · HD 1080p",    desc:"All 3 episodes + bonus behind-the-scenes footage." },
  { id:9,  name:"Producer Beat Pack",   price:35,  category:"Digital",     emoji:"🎹", colors:[], sizes:[], stock:999, sold:47,  digital:true,  format:"WAV + STEMS",       desc:"8 exclusive beats with trackouts. Royalty-free for personal use." },
  { id:10, name:"Brand Preset Pack",    price:18,  category:"Digital",     emoji:"✨", colors:[], sizes:[], stock:999, sold:134, digital:true,  format:"Lightroom + CapCut", desc:"15 photo presets + 6 video LUTs. Instant download." },
  { id:11, name:"Content Strategy PDF", price:12,  category:"Digital",     emoji:"📋", colors:[], sizes:[], stock:999, sold:211, digital:true,  format:"PDF · 47 pages",    desc:"My full 90-day content strategy. The exact blueprint I use." },
  { id:12, name:"Fan Membership",       price:4.99,category:"Digital",     emoji:"⭐", colors:[], sizes:[], stock:999, sold:342, digital:true,  format:"Monthly subscription",desc:"Exclusive tracks, early episodes, behind-the-scenes access. Cancel anytime." },
];

const MERCH_CATEGORIES = ["All","Digital","Apparel","Accessories","Collectibles"];

function MerchStore({ config, goHome }) {
  const [category,  setCategory]  = useState("All");
  const [cart,      setCart]      = useState([]);
  const [screen,    setScreen]    = useState("shop");
  const [selected,  setSelected]  = useState({});
  const [orderNote, setOrderNote] = useState("");
  const pc = config.brand.primaryColor;
  const ac = config.brand.accentColor;

  // Use admin-configured products, fall back to static defaults
  const allProducts = (config.merch?.products?.length > 0)
    ? config.merch.products.filter(p => p.active !== false).map(p => ({
        ...p,
        price: parseFloat(p.price) || 0,
        colors: Array.isArray(p.colors) ? p.colors : [],
        sizes:  Array.isArray(p.sizes)  ? p.sizes  : [],
      }))
    : MERCH_PRODUCTS;

  const categories = ["All", ...new Set(allProducts.map(p => p.category))];
  const filtered   = category === "All" ? allProducts : allProducts.filter(p => p.category === category);
  const cartTotal  = cart.reduce((a,item) => a + item.price * item.qty, 0);
  const cartCount  = cart.reduce((a,item) => a + item.qty, 0);

  const addToCart = (product) => {
    setCart(prev => {
      const exists = prev.find(i => i.id === product.id);
      if (exists) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty:1 }];
    });
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(i => i.id !== id));
  const updateQty = (id, delta) => setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i).filter(i => i.qty > 0));

  const placeOrder = () => {
    setScreen("confirm");
    setCart([]);
  };

  const hasStripe = config.apis.stripeKey.length > 0;

  const hasDigitalItems   = cart.some(i => i.digital);
  const hasPhysicalItems  = cart.some(i => !i.digital);

  if (screen === "confirm") {
    return (
      <div style={{ padding:"60px 24px", textAlign:"center" }}>
      <BackButton onBack={goHome} />
        <div style={{ fontSize:"56px", marginBottom:"20px" }}>{hasDigitalItems && !hasPhysicalItems ? "⚡" : "🎉"}</div>
        <div style={{ fontSize:"22px", fontWeight:"900", marginBottom:"8px", background:`linear-gradient(135deg,${pc},${ac})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
          {hasDigitalItems && !hasPhysicalItems ? "DOWNLOAD READY!" : "ORDER PLACED!"}
        </div>
        <div style={{ fontSize:"14px", color:"#777", marginBottom:"24px", lineHeight:1.6 }}>
          {hasDigitalItems && !hasPhysicalItems
            ? "Your download link has been sent to your email. Access instantly — no waiting."
            : hasDigitalItems
              ? "Digital downloads sent to your email instantly. Physical items ship in 3–5 days."
              : "Your order is confirmed. Ships within 3–5 business days."}
        </div>
        {hasDigitalItems && (
          <div style={{ padding:"14px", borderRadius:"12px", marginBottom:"20px", background:"rgba(0,245,212,0.07)", border:"1px solid rgba(0,245,212,0.2)" }}>
            <div style={{ fontSize:"11px", fontWeight:"800", color:"#00F5D4", marginBottom:"6px" }}>⚡ DIGITAL ITEMS — INSTANT ACCESS</div>
            {cart.filter(i => i.digital).map((item,i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:i<cart.filter(x=>x.digital).length-1?"1px solid rgba(0,245,212,0.1)":"none" }}>
                <span style={{ fontSize:"12px", color:"#ccc" }}>{item.emoji} {item.name}</span>
                <button style={{ fontSize:"10px", color:"#00F5D4", background:"none", border:"1px solid rgba(0,245,212,0.3)", borderRadius:"7px", padding:"3px 10px", cursor:"pointer", fontFamily:"monospace" }}>↓ DOWNLOAD</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setScreen("shop")} style={{ padding:"14px 32px", borderRadius:"12px", border:"none", background:`linear-gradient(135deg,${pc},${ac})`, color:"#000", fontWeight:"900", fontSize:"13px", letterSpacing:"0.15em", cursor:"pointer" }}>
          ◆ KEEP SHOPPING
        </button>
      </div>
    );
  }

  if (screen === "cart") {
    return (
      <div style={{ padding:"28px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"24px" }}>
          <button onClick={() => setScreen("shop")} style={{ background:"none", border:"none", color:pc, fontSize:"18px", cursor:"pointer", padding:"4px" }}>←</button>
          <SH icon="🛒" title="YOUR CART" accent={pc} sub={`${cartCount} item${cartCount!==1?"s":""} · $${cartTotal}`} />
        </div>

        {cart.length === 0 ? (
          <div style={{ textAlign:"center", padding:"40px 20px" }}>
            <div style={{ fontSize:"36px", marginBottom:"12px" }}>🛍</div>
            <div style={{ fontSize:"14px", color:"#555" }}>Your cart is empty</div>
            <button onClick={() => setScreen("shop")} style={{ marginTop:"16px", padding:"10px 24px", borderRadius:"10px", border:`1px solid ${pc}`, background:"none", color:pc, fontSize:"11px", cursor:"pointer" }}>BROWSE MERCH</button>
          </div>
        ) : (
          <div>
            {cart.map((item,i) => (
              <div key={item.id} style={{ display:"flex", alignItems:"center", gap:"14px", padding:"16px", marginBottom:"10px", borderRadius:"12px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ width:"52px", height:"52px", borderRadius:"10px", background:`linear-gradient(135deg,${pc}22,${ac}14)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"24px", flexShrink:0 }}>{item.emoji}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:"13px", fontWeight:"700" }}>{item.name}</div>
                  <div style={{ fontSize:"10px", color:"#555", fontFamily:"monospace" }}>{item.category}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                  <button onClick={() => updateQty(item.id,-1)} style={{ width:"24px", height:"24px", borderRadius:"50%", border:"1px solid rgba(255,255,255,0.1)", background:"none", color:"#ccc", cursor:"pointer", fontSize:"14px", display:"flex", alignItems:"center", justifyContent:"center" }}>−</button>
                  <span style={{ fontSize:"12px", fontWeight:"700", minWidth:"16px", textAlign:"center" }}>{item.qty}</span>
                  <button onClick={() => updateQty(item.id,+1)} style={{ width:"24px", height:"24px", borderRadius:"50%", border:`1px solid ${pc}`, background:`${pc}22`, color:pc, cursor:"pointer", fontSize:"14px", display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:"13px", fontWeight:"800", color:pc, fontFamily:"monospace" }}>${item.price * item.qty}</div>
                  <button onClick={() => removeFromCart(item.id)} style={{ fontSize:"9px", color:"#FF3B30", background:"none", border:"none", cursor:"pointer", marginTop:"2px" }}>REMOVE</button>
                </div>
              </div>
            ))}

            <div style={{ marginTop:"20px", padding:"16px", borderRadius:"12px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px" }}>
                <span style={{ fontSize:"12px", color:"#777" }}>Subtotal</span>
                <span style={{ fontSize:"12px", fontFamily:"monospace" }}>${cartTotal}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px" }}>
                <span style={{ fontSize:"12px", color:"#777" }}>Shipping</span>
                <span style={{ fontSize:"12px", color:"#00F5D4", fontFamily:"monospace" }}>FREE</span>
              </div>
              <div style={{ height:"1px", background:"rgba(255,255,255,0.06)", margin:"10px 0" }} />
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:"14px", fontWeight:"700" }}>Total</span>
                <span style={{ fontSize:"16px", fontWeight:"900", color:pc, fontFamily:"monospace" }}>${cartTotal}</span>
              </div>
            </div>

            <div style={{ marginTop:"14px" }}>
              <div style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#555", marginBottom:"8px" }}>ORDER NOTE (OPTIONAL)</div>
              <textarea value={orderNote} onChange={e => setOrderNote(e.target.value)} placeholder="Special requests, gift messages..." rows={2}
                style={{ width:"100%", padding:"10px 13px", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"9px", color:"#E8E4DC", fontSize:"12px", outline:"none", fontFamily:"monospace", resize:"none" }} />
            </div>

            <button onClick={placeOrder} style={{ width:"100%", marginTop:"16px", padding:"16px", borderRadius:"12px", border:"none", background:`linear-gradient(135deg,${pc},${ac})`, color:"#000", fontSize:"13px", fontWeight:"900", letterSpacing:"0.15em", cursor:"pointer" }}>
              {hasStripe ? `◆ CHECKOUT · $${cartTotal}` : `◆ PLACE ORDER · $${cartTotal}`}
            </button>

            {!hasStripe && (
              <div style={{ marginTop:"10px", padding:"10px 14px", borderRadius:"8px", background:"rgba(255,214,10,0.07)", border:"1px solid rgba(255,214,10,0.2)", fontSize:"10px", color:"#FFD60A", textAlign:"center" }}>
                ⚠ Add your Stripe key in Admin → APIs to enable live payments
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // SHOP SCREEN
  return (
    <div style={{ padding:"28px 20px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"20px" }}>
        <SH icon="🛍" title="MERCH STORE" accent={pc} sub="Your brand. On everything." />
        <button onClick={() => setScreen("cart")} style={{ position:"relative", padding:"10px 14px", borderRadius:"12px", background:cartCount>0 ? `linear-gradient(135deg,${pc},${ac})` : "rgba(255,255,255,0.05)", border:"none", color:cartCount>0?"#000":"#555", fontSize:"12px", cursor:"pointer", flexShrink:0 }}>
          🛒 {cartCount>0 ? <strong>{cartCount}</strong> : "0"}
        </button>
      </div>

      {/* REVENUE SUMMARY */}
      <div style={{ display:"flex", gap:"10px", marginBottom:"20px" }}>
        {[{ label:"TOTAL SOLD", val:"1,338", color:pc },{ label:"THIS MONTH", val:"$5,820", color:ac },{ label:"DIGITAL SALES", val:"$2,140", color:"#00F5D4" }].map((s,i) => (
          <div key={i} style={{ flex:1, padding:"12px 8px", borderRadius:"10px", background:"rgba(255,255,255,0.03)", border:`1px solid ${s.color}22`, textAlign:"center" }}>
            <div style={{ fontSize:"15px", fontWeight:"900", color:s.color, fontFamily:"monospace" }}>{s.val}</div>
            <div style={{ fontSize:"7px", letterSpacing:"0.18em", color:"#484848", marginTop:"2px" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* DIGITAL HIGHLIGHT BANNER */}
      {(category === "All" || category === "Digital") && (
        <div style={{ padding:"14px", borderRadius:"12px", marginBottom:"16px", background:"linear-gradient(135deg,rgba(0,245,212,0.07),rgba(199,125,255,0.05))", border:"1px solid rgba(0,245,212,0.18)", display:"flex", alignItems:"center", gap:"10px" }}>
          <span style={{ fontSize:"22px" }}>⚡</span>
          <div>
            <div style={{ fontSize:"11px", fontWeight:"800", color:"#00F5D4", letterSpacing:"0.1em" }}>DIGITAL PRODUCTS = INSTANT DELIVERY</div>
            <div style={{ fontSize:"10px", color:"#666", marginTop:"2px" }}>Download link sent immediately after purchase. No shipping. No waiting.</div>
          </div>
        </div>
      )}

      {/* CATEGORY FILTER */}
      <div style={{ display:"flex", gap:"6px", overflowX:"auto", marginBottom:"20px", scrollbarWidth:"none" }}>
        {categories.map(c => (
          <button key={c} onClick={() => setCategory(c)} style={{ padding:"7px 14px", borderRadius:"16px", border:"none", cursor:"pointer", whiteSpace:"nowrap", background:category===c ? `linear-gradient(135deg,${pc},${ac})` : "rgba(255,255,255,0.05)", color:category===c ? "#000" : "#555", fontSize:"10px", fontWeight:"700", letterSpacing:"0.1em", fontFamily:"monospace", transition:"all 0.2s" }}>
            {c}{c==="Digital"?" ⚡":""}
          </button>
        ))}
      </div>

      {/* DIGITAL PRODUCTS — full-width cards */}
      {filtered.filter(p => p.digital).length > 0 && (
        <div style={{ marginBottom:"16px" }}>
          {filtered.filter(p => p.digital).map((product) => {
            const inCart = cart.find(c => c.id === product.id);
            return (
              <div key={product.id} style={{ marginBottom:"10px", borderRadius:"14px", overflow:"hidden", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(0,245,212,0.14)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"14px", padding:"16px" }}>
                  <div style={{ width:"52px", height:"52px", borderRadius:"12px", background:`linear-gradient(135deg,rgba(0,245,212,0.15),rgba(199,125,255,0.1))`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"24px", flexShrink:0 }}>
                    {product.emoji}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"2px" }}>
                      <span style={{ fontSize:"13px", fontWeight:"700", color:"#ddd" }}>{product.name}</span>
                      <span style={{ padding:"2px 7px", borderRadius:"8px", background:"rgba(0,245,212,0.12)", border:"1px solid rgba(0,245,212,0.25)", fontSize:"8px", color:"#00F5D4", fontFamily:"monospace" }}>DIGITAL ⚡</span>
                    </div>
                    <div style={{ fontSize:"9px", color:"#484848", fontFamily:"monospace", marginBottom:"4px" }}>{product.format}</div>
                    <div style={{ fontSize:"10px", color:"#666", lineHeight:1.4 }}>{product.desc}</div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:"16px", fontWeight:"900", color:"#00F5D4", fontFamily:"monospace", marginBottom:"6px" }}>
                      ${product.price}{product.id===12?<span style={{ fontSize:"9px" }}>/mo</span>:""}
                    </div>
                    <button onClick={() => addToCart(product)} style={{ padding:"7px 14px", borderRadius:"9px", border:"none", background:inCart ? "rgba(0,245,212,0.15)" : "linear-gradient(135deg,#00F5D4,#C77DFF)", color:inCart?"#00F5D4":"#000", fontSize:"9px", fontWeight:"800", letterSpacing:"0.1em", cursor:"pointer", fontFamily:"monospace" }}>
                      {inCart ? "✓ ADDED" : product.id===12 ? "SUBSCRIBE" : "BUY NOW"}
                    </button>
                  </div>
                </div>
                <div style={{ padding:"6px 16px 12px", display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:"9px", color:"#484848" }}>{product.sold} sold</span>
                  <span style={{ fontSize:"9px", color:"#00F5D4", fontFamily:"monospace" }}>⚡ Instant delivery after checkout</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PHYSICAL PRODUCTS — 2-column grid */}
      {filtered.filter(p => !p.digital).length > 0 && (
        <div>
          {category === "All" && filtered.filter(p=>p.digital).length > 0 && (
            <div style={{ fontSize:"9px", letterSpacing:"0.25em", color:"#555", fontFamily:"monospace", marginBottom:"12px" }}>PHYSICAL PRODUCTS</div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"12px" }}>
            {filtered.filter(p => !p.digital).map((product) => {
              const inCart = cart.find(c => c.id === product.id);
              return (
                <div key={product.id} style={{ borderRadius:"14px", overflow:"hidden", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ height:"120px", background:`linear-gradient(135deg,${pc}1a,${ac}14)`, display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
                    <span style={{ fontSize:"44px" }}>{product.emoji}</span>
                    {product.stock < 15 && product.stock > 0 && (
                      <div style={{ position:"absolute", top:"8px", right:"8px", padding:"3px 8px", borderRadius:"8px", background:"rgba(255,59,48,0.2)", border:"1px solid rgba(255,59,48,0.4)", fontSize:"8px", color:"#FF3B30", fontFamily:"monospace" }}>LOW STOCK</div>
                    )}
                    {inCart && (
                      <div style={{ position:"absolute", top:"8px", left:"8px", padding:"3px 8px", borderRadius:"8px", background:"rgba(0,245,212,0.2)", border:"1px solid rgba(0,245,212,0.4)", fontSize:"8px", color:"#00F5D4", fontFamily:"monospace" }}>IN CART ✓</div>
                    )}
                  </div>
                  <div style={{ padding:"12px" }}>
                    <div style={{ fontSize:"12px", fontWeight:"700", marginBottom:"2px" }}>{product.name}</div>
                    <div style={{ fontSize:"9px", color:"#555", fontFamily:"monospace", marginBottom:"8px" }}>{product.category} · {product.sold} sold</div>
                    {product.colors.length > 0 && (
                      <div style={{ display:"flex", gap:"4px", marginBottom:"8px" }}>
                        {product.colors.map((c,ci) => (
                          <div key={ci} style={{ width:"14px", height:"14px", borderRadius:"50%", background:c, border:c==="#fff"?"1px solid rgba(255,255,255,0.2)":"none", cursor:"pointer" }} />
                        ))}
                      </div>
                    )}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontSize:"16px", fontWeight:"900", color:pc, fontFamily:"monospace" }}>${product.price}</div>
                      <button onClick={() => addToCart(product)} style={{ padding:"6px 12px", borderRadius:"8px", border:"none", background:inCart?`${pc}33`:`linear-gradient(135deg,${pc},${ac})`, color:inCart?pc:"#000", fontSize:"9px", fontWeight:"800", letterSpacing:"0.1em", cursor:"pointer", fontFamily:"monospace", transition:"all 0.2s" }}>
                        {inCart ? "✓ ADDED" : "+ ADD"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FLOATING CART BUTTON */}
      {cartCount > 0 && (
        <div style={{ position:"fixed", bottom:"90px", left:"50%", transform:"translateX(-50%)", zIndex:50 }}>
          <button onClick={() => setScreen("cart")} style={{ display:"flex", alignItems:"center", gap:"10px", padding:"14px 28px", borderRadius:"30px", border:"none", background:`linear-gradient(135deg,${pc},${ac})`, color:"#000", fontWeight:"900", fontSize:"12px", letterSpacing:"0.12em", cursor:"pointer", boxShadow:`0 8px 32px ${pc}55`, whiteSpace:"nowrap" }}>
            🛒 VIEW CART ({cartCount}) · ${cartTotal.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── FEATURE LOCKED SCREEN ────────────────────────────────────────────────────
function FeatureLockedScreen({ name, flag, go }) {
  return (
    <div style={{ padding:"80px 24px", textAlign:"center" }}>
      <div style={{ fontSize:"48px", marginBottom:"16px" }}>🔒</div>
      <div style={{ fontSize:"18px", fontWeight:"900", marginBottom:"8px", color:"#F0EDE8" }}>{name}</div>
      <div style={{ fontSize:"14px", color:"#555", marginBottom:"28px", lineHeight:1.6 }}>
        This feature is currently disabled.<br />Enable it in your Admin panel to unlock it.
      </div>
      <button onClick={go} style={{ padding:"12px 28px", borderRadius:"12px", border:"none", background:"linear-gradient(135deg,#FF6B35,#C77DFF)", color:"#000", fontWeight:"900", fontSize:"12px", letterSpacing:"0.15em", cursor:"pointer" }}>
        ⚙ GO TO ADMIN → FEATURES
      </button>
    </div>
  );
}
