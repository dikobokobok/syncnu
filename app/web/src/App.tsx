import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// ─── Auth helpers (token disimpan di localStorage) ────────────────────────────
const TOKEN_KEY = 'syncnu_token';
function getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

const DEFAULT_BACKEND_URL = `${window.location.protocol}//${window.location.hostname}:8889`;
const BACKEND_URL = localStorage.getItem('syncnu_backend_url') || DEFAULT_BACKEND_URL;

// ─── Types ────────────────────────────────────────────────────────────────────
interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  path: string;
  owner: string;
  created_at: string;
  modified_at?: string;
  folder_id?: string | null;
  folder_name?: string | null;
  deleted_at?: string | null;
  is_favorited?: boolean;
}

interface FolderItem {
  id: string;
  name: string;
  owner: string;
  created_at: string;
  fileCount?: number;
  modified_at?: string;
}

interface Notification {
  id: string;
  type: string;
  message: string;
  shared_by: string;
  item_name: string;
  item_type: string;
  created_at: string;
}

type ActiveNav = 'home' | 'recent' | 'shared' | 'starred' | 'trash' | 'folders';
type DetailTab = 'detail' | 'activity' | 'comments';

// ─── Unified Activity Panel Types ─────────────────────────────────────────────
type ActivityOp = 'upload' | 'delete' | 'restore' | 'permanent-delete' | 'create-folder';
type ActivityStatus = 'pending' | 'active' | 'done' | 'error';

interface ActivityItem {
  id: string;
  op: ActivityOp;
  name: string;
  size?: number;          // upload: ukuran file
  progress?: number;      // upload: 0–100
  itemType?: 'file' | 'folder';
  fileCount?: number;     // folder delete: jumlah file di dalamnya
  status: ActivityStatus;
  errorMsg?: string;
}

interface Notification {
  id: string;
  type: string;
  message: string;
  shared_by: string;
  item_name: string;
  item_type: string; // "file" or "folder"
  created_at: string;
}


// ─── Default Folders (matches backend config) ──────────────────────────────────
// These names MUST match the backend DEFAULT_FOLDERS keys exactly.
const DEFAULT_FOLDERS: Record<string, {
  accept: string;
  label: string;
  color: string;
  icon: React.ReactNode;
}> = {
  'Dokumen': {
    accept: [
      // Office
      '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rtf,.odt,.ods,.odp,.csv',
      // Text & developer
      '.txt,.md,.mdx,.json,.xml,.yaml,.yml,.html,.htm,.css',
      '.js,.ts,.tsx,.jsx,.py,.java,.php,.go,.rs,.sh,.bash,.sql,.env,.log,.ini,.toml,.conf',
      // Archive
      '.zip,.rar,.7z,.tar,.gz,.tgz,.bz2,.xz',
    ].join(','),
    label: 'Dokumen, Kode, & Arsip',
    color: 'text-blue-600',
    icon: <svg className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM9 13h6v1H9v-1zm0 3h6v1H9v-1zm0-6h3v1H9v-1z"/></svg>,
  },
  'Gambar': {
    accept: [
      '.jpg,.jpeg,.png,.gif,.webp,.avif',
      '.svg,.eps,.ai',
      '.raw,.cr2,.nef,.arw,.dng,.tiff,.tif,.heic,.heif',
      '.psd,.xcf,.bmp,.ico,.fig,.sketch',
      'image/*',
    ].join(','),
    label: 'JPG, PNG, WebP, SVG, RAW, PSD...',
    color: 'text-emerald-600',
    icon: <svg className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>,
  },
  'Video': {
    accept: [
      '.mp4,.webm,.mkv',
      '.mov,.avi,.wmv,.flv,.f4v',
      '.mxf,.mts,.m2ts',
      '.3gp,.vob,.mpg,.mpeg,.m4v',
      'video/*',
    ].join(','),
    label: 'MP4, MKV, MOV, WebM, AVI...',
    color: 'text-purple-600',
    icon: <svg className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>,
  },
  'Musik': {
    accept: '.mp3,.wav,.ogg,.flac,.aac,.m4a,.wma,.opus,.aiff,.alac,.mid,.midi,audio/*',
    label: 'MP3, WAV, FLAC, AAC, MIDI...',
    color: 'text-pink-600',
    icon: <svg className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z"/></svg>,
  },
};

const DEFAULT_FOLDER_NAMES = Object.keys(DEFAULT_FOLDERS);

function isDefaultFolder(name: string) { return DEFAULT_FOLDER_NAMES.includes(name); }
function getFolderAccept(name: string): string { return DEFAULT_FOLDERS[name]?.accept || ''; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins || 1} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Kemarin';
  if (days < 7) return `${days} hari lalu`;
  return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getFileExtLabel(mimeType: string, name: string): { label: string; bg: string } {
  const ext = name.split('.').pop()?.toUpperCase() || '';
  const extLow = ext.toLowerCase();
  const t = mimeType.toLowerCase();

  // ── Office / Dokumen ──
  if (t.includes('pdf') || extLow === 'pdf')
    return { label: 'PDF', bg: 'bg-red-500' };
  if (t.includes('word') || extLow === 'docx' || extLow === 'doc')
    return { label: 'DOC', bg: 'bg-blue-600' };
  if (t.includes('sheet') || extLow === 'xlsx' || extLow === 'xls')
    return { label: 'XLS', bg: 'bg-emerald-600' };
  if (t.includes('presentation') || extLow === 'pptx' || extLow === 'ppt')
    return { label: 'PPT', bg: 'bg-orange-500' };
  if (extLow === 'rtf')
    return { label: 'RTF', bg: 'bg-blue-400' };
  if (extLow === 'odt')
    return { label: 'ODT', bg: 'bg-cyan-600' };
  if (extLow === 'ods')
    return { label: 'ODS', bg: 'bg-teal-600' };
  if (extLow === 'odp')
    return { label: 'ODP', bg: 'bg-amber-600' };
  if (extLow === 'csv')
    return { label: 'CSV', bg: 'bg-emerald-500' };

  // ── Developer / Code ──
  if (extLow === 'json')
    return { label: 'JSON', bg: 'bg-yellow-500' };
  if (extLow === 'html' || extLow === 'htm')
    return { label: 'HTML', bg: 'bg-orange-600' };
  if (extLow === 'css')
    return { label: 'CSS', bg: 'bg-blue-500' };
  if (extLow === 'js')
    return { label: 'JS', bg: 'bg-yellow-400' };
  if (extLow === 'ts' || extLow === 'tsx')
    return { label: 'TS', bg: 'bg-blue-500' };
  if (extLow === 'jsx')
    return { label: 'JSX', bg: 'bg-cyan-500' };
  if (extLow === 'md' || extLow === 'mdx')
    return { label: 'MD', bg: 'bg-slate-500' };
  if (extLow === 'txt')
    return { label: 'TXT', bg: 'bg-slate-400' };
  if (extLow === 'xml')
    return { label: 'XML', bg: 'bg-orange-400' };
  if (extLow === 'yaml' || extLow === 'yml')
    return { label: 'YML', bg: 'bg-red-400' };
  if (extLow === 'sql')
    return { label: 'SQL', bg: 'bg-indigo-500' };
  if (extLow === 'py')
    return { label: 'PY', bg: 'bg-blue-400' };
  if (extLow === 'java')
    return { label: 'JAVA', bg: 'bg-red-600' };
  if (extLow === 'php')
    return { label: 'PHP', bg: 'bg-violet-500' };
  if (extLow === 'go')
    return { label: 'GO', bg: 'bg-cyan-600' };
  if (extLow === 'rs')
    return { label: 'RS', bg: 'bg-orange-700' };
  if (extLow === 'sh' || extLow === 'bash')
    return { label: 'SH', bg: 'bg-slate-600' };
  if (extLow === 'env' || extLow === 'log')
    return { label: extLow === 'env' ? 'ENV' : 'LOG', bg: 'bg-slate-500' };

  // ── Gambar ──
  if (['jpg','jpeg'].includes(extLow))
    return { label: 'JPG', bg: 'bg-purple-500' };
  if (extLow === 'png')
    return { label: 'PNG', bg: 'bg-purple-600' };
  if (extLow === 'gif')
    return { label: 'GIF', bg: 'bg-fuchsia-500' };
  if (extLow === 'webp')
    return { label: 'WEBP', bg: 'bg-violet-500' };
  if (extLow === 'avif')
    return { label: 'AVIF', bg: 'bg-violet-600' };
  if (extLow === 'svg')
    return { label: 'SVG', bg: 'bg-emerald-500' };
  if (['eps','ai'].includes(extLow))
    return { label: extLow.toUpperCase(), bg: 'bg-orange-600' };
  if (['raw','cr2','nef','arw','dng'].includes(extLow))
    return { label: 'RAW', bg: 'bg-slate-600' };
  if (['tiff','tif'].includes(extLow))
    return { label: 'TIFF', bg: 'bg-slate-500' };
  if (['heic','heif'].includes(extLow))
    return { label: 'HEIC', bg: 'bg-slate-500' };
  if (extLow === 'psd')
    return { label: 'PSD', bg: 'bg-blue-700' };
  if (extLow === 'xcf')
    return { label: 'XCF', bg: 'bg-slate-600' };
  if (extLow === 'fig')
    return { label: 'FIG', bg: 'bg-purple-700' };
  if (extLow === 'sketch')
    return { label: 'SKT', bg: 'bg-amber-500' };
  if (extLow === 'bmp')
    return { label: 'BMP', bg: 'bg-slate-400' };
  if (t.startsWith('image/'))
    return { label: 'IMG', bg: 'bg-purple-500' };

  // ── Video ──
  if (extLow === 'mp4')
    return { label: 'MP4', bg: 'bg-sky-500' };
  if (extLow === 'webm')
    return { label: 'WEBM', bg: 'bg-sky-600' };
  if (extLow === 'mkv')
    return { label: 'MKV', bg: 'bg-indigo-500' };
  if (extLow === 'mov')
    return { label: 'MOV', bg: 'bg-slate-500' };
  if (extLow === 'avi')
    return { label: 'AVI', bg: 'bg-slate-600' };
  if (['wmv','flv','f4v'].includes(extLow))
    return { label: extLow.toUpperCase(), bg: 'bg-slate-500' };
  if (['mxf','mts','m2ts'].includes(extLow))
    return { label: extLow.toUpperCase(), bg: 'bg-cyan-700' };
  if (extLow === '3gp')
    return { label: '3GP', bg: 'bg-slate-400' };
  if (['vob','mpg','mpeg'].includes(extLow))
    return { label: extLow.toUpperCase(), bg: 'bg-slate-500' };
  if (t.startsWith('video/'))
    return { label: 'VID', bg: 'bg-sky-500' };

  // ── Audio ──
  if (extLow === 'mp3')
    return { label: 'MP3', bg: 'bg-pink-500' };
  if (extLow === 'flac')
    return { label: 'FLAC', bg: 'bg-pink-600' };
  if (['wav','aiff'].includes(extLow))
    return { label: extLow.toUpperCase(), bg: 'bg-rose-500' };
  if (['aac','m4a','alac'].includes(extLow))
    return { label: extLow.toUpperCase(), bg: 'bg-pink-400' };
  if (['ogg','opus'].includes(extLow))
    return { label: extLow.toUpperCase(), bg: 'bg-fuchsia-600' };
  if (extLow === 'wma')
    return { label: 'WMA', bg: 'bg-slate-500' };
  if (['mid','midi'].includes(extLow))
    return { label: 'MIDI', bg: 'bg-violet-600' };
  if (t.startsWith('audio/'))
    return { label: 'AUD', bg: 'bg-pink-500' };

  // ── Arsip / Kompresi ──
  if (['zip','rar','7z','tar','gz','tgz','bz2','xz'].includes(extLow) || t.includes('zip') || t.includes('compressed') || t.includes('x-tar'))
    return { label: 'ZIP', bg: 'bg-slate-600' };

  // ── Fallback ──
  return { label: ext.slice(0, 4) || 'FILE', bg: 'bg-slate-500' };
}

function getFileMimeLabel(mimeType: string, name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const t = mimeType.toLowerCase();

  // Office
  if (t.includes('pdf') || ext === 'pdf') return 'PDF Document';
  if (t.includes('word') || ext === 'docx') return 'Microsoft Word (.docx)';
  if (ext === 'doc') return 'Microsoft Word (.doc)';
  if (t.includes('sheet') || ext === 'xlsx') return 'Microsoft Excel (.xlsx)';
  if (ext === 'xls') return 'Microsoft Excel (.xls)';
  if (t.includes('presentation') || ext === 'pptx') return 'Microsoft PowerPoint (.pptx)';
  if (ext === 'ppt') return 'Microsoft PowerPoint (.ppt)';
  if (ext === 'rtf') return 'Rich Text Format (.rtf)';
  if (ext === 'odt') return 'OpenDocument Text (.odt)';
  if (ext === 'ods') return 'OpenDocument Spreadsheet (.ods)';
  if (ext === 'odp') return 'OpenDocument Presentation (.odp)';
  if (ext === 'csv') return 'CSV Spreadsheet';

  // Developer
  if (ext === 'json') return 'JSON Data';
  if (ext === 'html' || ext === 'htm') return 'HTML Document';
  if (ext === 'css') return 'CSS Stylesheet';
  if (ext === 'js') return 'JavaScript';
  if (ext === 'ts') return 'TypeScript';
  if (ext === 'tsx') return 'TypeScript React';
  if (ext === 'jsx') return 'JavaScript React';
  if (ext === 'md' || ext === 'mdx') return 'Markdown';
  if (ext === 'txt') return 'Plain Text';
  if (ext === 'xml') return 'XML Document';
  if (ext === 'yaml' || ext === 'yml') return 'YAML Config';
  if (ext === 'sql') return 'SQL Script';
  if (ext === 'py') return 'Python Script';
  if (ext === 'java') return 'Java Source';
  if (ext === 'php') return 'PHP Script';
  if (ext === 'go') return 'Go Source';
  if (ext === 'rs') return 'Rust Source';
  if (ext === 'sh' || ext === 'bash') return 'Shell Script';
  if (ext === 'env') return 'Environment Config';
  if (ext === 'log') return 'Log File';

  // Gambar
  if (['jpg','jpeg'].includes(ext)) return 'JPEG Image';
  if (ext === 'png') return 'PNG Image';
  if (ext === 'gif') return 'GIF Image';
  if (ext === 'webp') return 'WebP Image';
  if (ext === 'avif') return 'AVIF Image';
  if (ext === 'svg') return 'SVG Vector';
  if (ext === 'eps') return 'EPS Vector';
  if (ext === 'ai') return 'Adobe Illustrator';
  if (['raw','cr2','nef','arw'].includes(ext)) return `RAW Camera (.${ext})`;
  if (ext === 'dng') return 'Digital Negative (DNG)';
  if (['tiff','tif'].includes(ext)) return 'TIFF Image';
  if (['heic','heif'].includes(ext)) return 'HEIC/HEIF Image';
  if (ext === 'psd') return 'Adobe Photoshop';
  if (ext === 'xcf') return 'GIMP Image';
  if (ext === 'fig') return 'Figma File';
  if (ext === 'sketch') return 'Sketch File';
  if (ext === 'bmp') return 'Bitmap Image';
  if (t.startsWith('image/')) return `Image (.${ext})`;

  // Video
  if (ext === 'mp4') return 'MP4 Video';
  if (ext === 'webm') return 'WebM Video';
  if (ext === 'mkv') return 'Matroska Video';
  if (ext === 'mov') return 'QuickTime Video';
  if (ext === 'avi') return 'AVI Video';
  if (ext === 'wmv') return 'Windows Media Video';
  if (['flv','f4v'].includes(ext)) return 'Flash Video';
  if (ext === 'mxf') return 'MXF Broadcast Video';
  if (['mts','m2ts'].includes(ext)) return 'AVCHD Video';
  if (ext === '3gp') return '3GP Mobile Video';
  if (ext === 'vob') return 'DVD Video Object';
  if (['mpg','mpeg'].includes(ext)) return 'MPEG Video';
  if (t.startsWith('video/')) return `Video (.${ext})`;
  // Audio
  if (ext === 'mp3') return 'MP3 Audio';
  if (ext === 'wav') return 'WAV Audio';
  if (ext === 'flac') return 'FLAC Lossless Audio';
  if (ext === 'aac') return 'AAC Audio';
  if (['m4a','alac'].includes(ext)) return 'Apple Audio';
  if (ext === 'ogg') return 'OGG Audio';
  if (ext === 'opus') return 'Opus Audio';
  if (ext === 'wma') return 'Windows Media Audio';
  if (ext === 'aiff') return 'AIFF Audio';
  if (['mid','midi'].includes(ext)) return 'MIDI File';
  if (t.startsWith('audio/')) return `Audio (.${ext})`;

  // Archive
  if (['zip','rar','7z'].includes(ext)) return `${ext.toUpperCase()} Archive`;
  if (['tar','gz','tgz','bz2','xz'].includes(ext)) return `Compressed Archive (.${ext})`;

  return mimeType || `.${ext}` || 'Unknown';
}

// ─── SVG Icon Components ──────────────────────────────────────────────────────
const IconSearch = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconBell = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconSettings = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconChevronDown = ({ cls = 'h-3.5 w-3.5' }: { cls?: string }) => (
  <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconChevronUp = () => (
  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M5 15l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconFolder = ({ cls = 'h-4 w-4 text-blue-400 fill-current' }: { cls?: string }) => (
  <svg className={cls} viewBox="0 0 24 24">
    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);
const IconPlus = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconX = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconDownload = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconTrash = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconUpload = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconRefresh = ({ spin = false }: { spin?: boolean }) => (
  <svg className={`h-4 w-4 ${spin ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconGrid = () => (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconList = () => (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M4 6h16M4 10h16M4 14h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconShare = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconRestore = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const IconClock = () => (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);

// ─── Activity Panel (unified: upload, delete, restore, dll) ──────────────────
const OP_CONFIG: Record<ActivityOp, { label: string; activeColor: string; doneColor: string; spinColor: string }> = {
  'upload':           { label: 'Mengunggah',        activeColor: 'text-blue-400',   doneColor: 'text-emerald-400', spinColor: 'text-blue-400'   },
  'delete':           { label: 'Menghapus',          activeColor: 'text-red-400',    doneColor: 'text-amber-400',   spinColor: 'text-red-400'    },
  'restore':          { label: 'Memulihkan',         activeColor: 'text-emerald-400',doneColor: 'text-emerald-400', spinColor: 'text-emerald-400'},
  'permanent-delete': { label: 'Menghapus permanen', activeColor: 'text-red-500',    doneColor: 'text-red-400',     spinColor: 'text-red-500'    },
  'create-folder':    { label: 'Membuat folder',     activeColor: 'text-blue-400',   doneColor: 'text-blue-400',    spinColor: 'text-blue-400'   },
};

function ActivityPanel({
  items,
  onClose,
  onClear,
}: {
  items: ActivityItem[];
  onClose: () => void;
  onClear: () => void;
}) {
  const [minimized, setMinimized] = React.useState(false);

  const activeItems  = items.filter(i => i.status === 'active' || i.status === 'pending');
  const doneItems    = items.filter(i => i.status === 'done');
  const errorItems   = items.filter(i => i.status === 'error');
  const total        = items.length;
  const isRunning    = activeItems.length > 0;

  // Overall progress (upload items only have progress)
  const uploadItems  = items.filter(i => i.op === 'upload');
  const overallPct   = uploadItems.length > 0
    ? Math.round(uploadItems.reduce((s, i) => s + (i.status === 'done' ? 100 : (i.progress ?? 0)), 0) / uploadItems.length)
    : total > 0 ? Math.round((doneItems.length / total) * 100) : 0;

  // Header label — show the most recent active op
  const activeOp = activeItems[0]?.op ?? items[items.length - 1]?.op ?? 'upload';
  const cfg = OP_CONFIG[activeOp];
  const headerLabel = isRunning
    ? `${cfg.label} ${doneItems.length}/${total}...`
    : errorItems.length > 0
    ? `${doneItems.length} selesai, ${errorItems.length} gagal`
    : `${total} operasi selesai`;

  // Icon for header
  const HeaderIcon = () => {
    if (isRunning) return (
      <svg className={`h-4 w-4 ${cfg.spinColor} animate-spin shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      </svg>
    );
    if (errorItems.length > 0) return (
      <svg className="h-4 w-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      </svg>
    );
    return (
      <svg className="h-4 w-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      </svg>
    );
  };

  // Per-item icon
  const ItemIcon = ({ item }: { item: ActivityItem }) => {
    const c = OP_CONFIG[item.op];
    if (item.status === 'done') {
      if (item.op === 'delete')           return <svg className="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>;
      if (item.op === 'restore')          return <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>;
      if (item.op === 'permanent-delete') return <svg className="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>;
      if (item.op === 'create-folder')    return <svg className="h-4 w-4 text-blue-400" fill="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>;
      return <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} /></svg>;
    }
    if (item.status === 'error') return <svg className="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>;
    if (item.status === 'active') return <svg className={`h-4 w-4 ${c.spinColor} animate-spin`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>;
    return <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>;
  };

  const statusText = (item: ActivityItem): { text: string; cls: string } => {
    if (item.status === 'error')   return { text: item.errorMsg ?? 'Gagal', cls: 'text-red-400' };
    if (item.status === 'pending') return { text: 'Menunggu...', cls: 'text-slate-500' };
    if (item.status === 'active') {
      if (item.op === 'upload')           return { text: `${item.progress ?? 0}%`, cls: 'text-blue-400' };
      if (item.op === 'delete')           return { text: 'Menghapus...', cls: 'text-red-400' };
      if (item.op === 'restore')          return { text: 'Memulihkan...', cls: 'text-emerald-400' };
      if (item.op === 'permanent-delete') return { text: 'Menghapus permanen...', cls: 'text-red-500' };
      if (item.op === 'create-folder')    return { text: 'Membuat...', cls: 'text-blue-400' };
    }
    if (item.status === 'done') {
      if (item.op === 'upload')           return { text: 'Selesai', cls: 'text-emerald-400' };
      if (item.op === 'delete')           return { text: 'Dipindahkan ke sampah', cls: 'text-amber-400' };
      if (item.op === 'restore')          return { text: 'Dipulihkan', cls: 'text-emerald-400' };
      if (item.op === 'permanent-delete') return { text: 'Dihapus permanen', cls: 'text-red-400' };
      if (item.op === 'create-folder')    return { text: 'Folder dibuat', cls: 'text-blue-400' };
    }
    return { text: '', cls: '' };
  };

  const barColor = (item: ActivityItem) => {
    if (item.status === 'done')  return item.op === 'upload' ? 'bg-emerald-400' : 'bg-blue-500';
    if (item.status === 'error') return 'bg-red-500';
    return 'bg-blue-500';
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] bg-[#1e293b] border border-[#334155] rounded-2xl shadow-2xl overflow-hidden"
      style={{ width: minimized ? '280px' : '320px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-[#111827]/60 cursor-pointer select-none border-b border-[#334155]/60"
        onClick={() => setMinimized(v => !v)}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <HeaderIcon />
          <span className="text-sm font-semibold text-slate-200 truncate">{headerLabel}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setMinimized(v => !v)}
            className="p-1.5 text-slate-500 hover:text-slate-300 transition rounded-lg hover:bg-white/5"
            title={minimized ? 'Perluas' : 'Perkecil'}
          >
            {minimized
              ? <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 15l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>
              : <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 12H4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>
            }
          </button>
          {!isRunning && (
            <button onClick={onClear} className="p-1.5 text-slate-500 hover:text-slate-300 transition rounded-lg hover:bg-white/5 text-xs font-medium">
              Hapus
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-300 transition rounded-lg hover:bg-white/5">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>
          </button>
        </div>
      </div>

      {/* ── Minimized: compact bar ── */}
      {minimized && (
        <div className="px-4 py-2.5">
          <div className="w-full bg-[#0f172a] rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                errorItems.length > 0 && !isRunning ? 'bg-red-500' :
                !isRunning ? 'bg-emerald-500' : cfg.spinColor.replace('text-', 'bg-')
              }`}
              style={{ width: `${overallPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-slate-500">{doneItems.length}/{total} item</span>
            <span className="text-[10px] text-slate-500">{overallPct}%</span>
          </div>
        </div>
      )}

      {/* ── Expanded: overall bar + item list ── */}
      {!minimized && (
        <>
          {/* Overall progress bar — only when running */}
          {isRunning && (
            <div className="px-4 pt-2.5 pb-1.5 border-b border-[#334155]/40">
              <div className="w-full bg-[#0f172a] rounded-full h-1">
                <div className="h-1 rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${overallPct}%` }} />
              </div>
              <p className="text-[10px] text-slate-500 mt-1 text-right">{overallPct}%</p>
            </div>
          )}

          {/* Item list */}
          <div className="max-h-72 overflow-y-auto divide-y divide-[#334155]/40">
            {items.map(item => {
              const st = statusText(item);
              return (
                <div key={item.id} className="px-4 py-2.5 flex items-start gap-3">
                  <div className="shrink-0 mt-0.5"><ItemIcon item={item} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {item.itemType === 'folder' && (
                        <svg className="h-3 w-3 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                      )}
                      <p className="text-xs font-medium text-slate-200 truncate">{item.name}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.size !== undefined && (
                        <span className="text-[10px] text-slate-500">{formatBytes(item.size)}</span>
                      )}
                      {item.itemType === 'folder' && item.fileCount !== undefined && (
                        <span className="text-[10px] text-slate-500">{item.fileCount} file</span>
                      )}
                      {st.text && <span className={`text-[10px] ${st.cls}`}>{st.text}</span>}
                    </div>
                    {/* Progress bar — upload only */}
                    {item.op === 'upload' && (item.status === 'active' || item.status === 'done') && (
                      <div className="w-full bg-[#0f172a] rounded-full h-0.5 mt-1.5">
                        <div
                          className={`h-0.5 rounded-full transition-all duration-200 ${barColor(item)}`}
                          style={{ width: `${item.progress ?? 0}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}


// ─── File Preview Component ─────────────────────────────────────────────────
// ─── File Preview Component ─────────────────────────────────────────────────
function FilePreview({ file, backendUrl }: { file: { name: string; type: string; path: string; size: number }; backendUrl: string }) {
  const [textContent, setTextContent] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const url = `${backendUrl}${file.path}`;
  const mime = file.type.toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');
  const isPDF = mime.includes('pdf') || ext === 'pdf';
  const isText = mime.startsWith('text/') || ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'xml', 'csv', 'yaml', 'yml', 'sh', 'py', 'java', 'c', 'cpp', 'h', 'rs', 'go', 'php', 'rb', 'sql', 'env', 'log'].includes(ext);

  useEffect(() => {
    setTextContent(null);
    setLoadError(false);
    if (isText && file.size < 512 * 1024) {
      fetch(url)
        .then(r => r.text())
        .then(t => setTextContent(t))
        .catch(() => setLoadError(true));
    }
  }, [url]);

  if (isImage) {
    return (
      <div className="bg-checkerboard rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center min-h-[140px] max-h-[240px]" style={{ background: 'repeating-conic-gradient(#f1f5f9 0% 25%, #e2e8f0 0% 50%) 0 0 / 16px 16px' }}>
        <img
          src={url}
          alt={file.name}
          className="max-w-full max-h-[240px] object-contain"
          onError={() => setLoadError(true)}
        />
        {loadError && <span className="text-xs text-slate-500 p-4">Gagal memuat gambar</span>}
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="rounded-lg overflow-hidden border border-slate-200 bg-black">
        <video controls className="w-full max-h-[200px]" onError={() => setLoadError(true)}>
          <source src={url} type={file.type} />
          Browser tidak mendukung video.
        </video>
        {loadError && <p className="text-xs text-slate-500 text-center p-3">Gagal memuat video</p>}
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" /></svg>
          </div>
          <p className="text-xs font-semibold text-slate-700 truncate flex-1">{file.name}</p>
        </div>
        <audio controls className="w-full" onError={() => setLoadError(true)}>
          <source src={url} type={file.type} />
        </audio>
        {loadError && <p className="text-xs text-slate-500 text-center mt-2">Gagal memuat audio</p>}
      </div>
    );
  }

  if (isPDF) {
    return (
      <div className="rounded-lg overflow-hidden border border-slate-200" style={{ height: '280px' }}>
        <iframe src={url} className="w-full h-full" title={file.name} onError={() => setLoadError(true)} />
        {loadError && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <svg className="h-8 w-8 text-red-400" fill="currentColor" viewBox="0 0 24 24"><path d="M7 11.5v-1h10v1H7zm0 3v-1h7v1H7zM19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z" /></svg>
            <p className="text-xs text-slate-500">PDF tidak dapat ditampilkan</p>
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline font-semibold">Buka di tab baru</a>
          </div>
        )}
      </div>
    );
  }

  if (isText) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-950 overflow-hidden" style={{ maxHeight: '240px' }}>
        {textContent === null && !loadError ? (
          <div className="flex items-center justify-center h-20 gap-2">
            <svg className="h-4 w-4 animate-spin text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>
            <span className="text-xs text-slate-400">Memuat...</span>
          </div>
        ) : loadError ? (
          <p className="text-xs text-slate-500 text-center p-4">Gagal memuat konten</p>
        ) : (
          <pre className="text-[10px] text-emerald-300 font-mono p-3 overflow-auto" style={{ maxHeight: '240px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {textContent}
          </pre>
        )}
      </div>
    );
  }

  // Fallback — unsupported type
  return (
    <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 py-8">
      <svg className="h-10 w-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      <p className="text-xs text-slate-500 font-medium">Preview tidak tersedia</p>
      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline font-semibold">Buka file</a>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage({
  onLogin,
  onRegister,
}: {
  onLogin: (username: string, pass: string) => Promise<{ success: boolean; message?: string }>;
  onRegister: (username: string, email: string, pass: string, name: string) => Promise<{ success: boolean; message?: string }>;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tempIp, setTempIp] = useState(localStorage.getItem('syncnu_backend_url') || `${window.location.protocol}//${window.location.hostname}:8889`);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('syncnu_backend_url', tempIp.trim());
    alert('Pengaturan IP Server disimpan. Halaman akan dimuat ulang.');
    window.location.reload();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegistering) {
        const res = await onRegister(username, email, password, name);
        if (!res.success) {
          setError(res.message || 'Pendaftaran gagal.');
        } else {
          alert('Pendaftaran berhasil! Silakan masuk.');
          setIsRegistering(false);
        }
      } else {
        const res = await onLogin(username, password);
        if (!res.success) {
          setError(res.message || 'Username atau password salah.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4" style={{
      backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.12) 0%, transparent 60%)'
    }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-1.5 mb-8 justify-center">
          <img src="/icon.png" alt="Syncnu" className="w-11 h-11 rounded-xl object-contain" />
          <span className="font-bold text-xl text-white tracking-tight">Syncnu</span>
        </div>

        <div className="bg-[#1e293b] border border-[#334155] rounded-2xl p-8 shadow-2xl relative">
          
          {showSettings ? (
            <div>
              <h2 className="text-lg font-bold text-white mb-1 text-center">Pengaturan Server</h2>
              <p className="text-sm text-slate-400 text-center mb-6">Konfigurasi IP / URL Backend Server</p>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">URL Server Backend</label>
                  <input
                    type="text" required value={tempIp} onChange={e => setTempIp(e.target.value)}
                    placeholder="http://localhost:8889"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#0f172a] border border-[#334155] focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none text-sm text-white placeholder:text-slate-600 transition-all"
                  />
                </div>
                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="w-1/2 py-2.5 rounded-lg border border-[#334155] text-slate-300 font-semibold text-sm hover:bg-white/5 transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20"
                  >
                    Simpan
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-white mb-1 text-center">
                {isRegistering ? 'Buat akun baru' : 'Selamat datang kembali'}
              </h2>
              <p className="text-sm text-slate-400 text-center mb-6">
                {isRegistering ? 'Daftar untuk mulai menggunakan Syncnu' : 'Masuk ke cloud storage Anda'}
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center font-medium">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Username</label>
                  <input
                    type="text" required value={username} onChange={e => setUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#0f172a] border border-[#334155] focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none text-sm text-white placeholder:text-slate-600 transition-all"
                  />
                </div>
                {isRegistering && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                      <input
                        type="email" required value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="w-full px-3.5 py-2.5 rounded-lg bg-[#0f172a] border border-[#334155] focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none text-sm text-white placeholder:text-slate-600 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Nama</label>
                      <input
                        type="text" value={name} onChange={e => setName(e.target.value)}
                        placeholder="Nama lengkap (opsional)"
                        className="w-full px-3.5 py-2.5 rounded-lg bg-[#0f172a] border border-[#334155] focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none text-sm text-white placeholder:text-slate-600 transition-all"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
                  <input
                    type="password" required value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#0f172a] border border-[#334155] focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none text-sm text-white placeholder:text-slate-600 transition-all"
                  />
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? 'Memproses...' : isRegistering ? 'Daftar' : 'Masuk'}
                </button>
              </form>

              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
                  className="text-xs text-slate-400 hover:text-blue-400 transition font-medium"
                >
                  {isRegistering ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar sekarang'}
                </button>
              </div>


            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; initials: string } | null>(null);

  // Data state
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);

  // UI state
  const [activeNav, setActiveNav] = useState<ActiveNav>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('detail');
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [folderSortBy, setFolderSortBy] = useState<'name' | 'modified'>('name');
  const [folderSortAsc, setFolderSortAsc] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [storageStats, setStorageStats] = useState<{ used: number; total: number; free: number } | null>(null);

  // Notification states
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [lastNotifCheck, setLastNotifCheck] = useState<string | null>(() => localStorage.getItem('syncnu_last_notif_check'));

  // Mobile sidebar state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [trashFiles, setTrashFiles] = useState<FileItem[]>([]);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounter = useRef(0);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  // Share States
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareItem, setShareItem] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareTab, setShareTab] = useState<'email' | 'link'>('email');
  const [shareLink, setShareLink] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [sharedItems, setSharedItems] = useState<any[]>([]);
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const [selectedSharedFolder, setSelectedSharedFolder] = useState<any | null>(null);
  const [existingShares, setExistingShares] = useState<any[]>([]);
  const [isLoadingExistingShares, setIsLoadingExistingShares] = useState(false);

  // Public Share State
  const [publicShareToken, setPublicShareToken] = useState<string | null>(() => {
    const parts = window.location.pathname.split('/');
    const shareIndex = parts.indexOf('share');
    return shareIndex !== -1 && parts[shareIndex + 1] ? parts[shareIndex + 1] : null;
  });
  const [publicShareData, setPublicShareData] = useState<any>(null);
  const [isLoadingPublicShare, setIsLoadingPublicShare] = useState(false);
  const [publicShareError, setPublicShareError] = useState<string | null>(null);

  // Unified activity queue for all operations
  const [activityQueue, setActivityQueue] = useState<ActivityItem[]>([]);
  const [showActivityPanel, setShowActivityPanel] = useState(false);
  const activityPanelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderDirUploadRef = useRef<HTMLInputElement>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const showToast = (text: string, type: 'success' | 'error') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleToggleFavorite = async (file: FileItem) => {
    try {
      await axios.post(`${BACKEND_URL}/api/files/${file.id}/favorite`);
      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, is_favorited: !f.is_favorited } : f));
      if (selectedFile?.id === file.id) {
        setSelectedFile(prev => prev ? { ...prev, is_favorited: !prev.is_favorited } : prev);
      }
      showToast(file.is_favorited ? `Dihapus dari favorit` : `Ditambahkan ke favorit`, 'success');
    } catch {
      showToast('Gagal memperbarui favorit.', 'error');
    }
  };

  const handleBulkFavorite = async () => {
    try {
      const selectedFiles = files.filter(f => selectedFileIds.includes(f.id));
      await Promise.all(selectedFiles.map(f => axios.post(`${BACKEND_URL}/api/files/${f.id}/favorite`)));
      showToast(`Berhasil memperbarui favorit ${selectedFileIds.length} file`, 'success');
      setSelectedFileIds([]);
      fetchFiles();
    } catch {
      showToast('Gagal memproses favorit massal.', 'error');
    }
  };

  const handleBulkDownload = () => {
    const selectedFiles = files.filter(f => selectedFileIds.includes(f.id));
    selectedFiles.forEach((file, index) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = `${BACKEND_URL}${file.path}`;
        a.download = file.name;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, index * 200);
    });
    showToast(`Memulai pengunduhan ${selectedFileIds.length} file`, 'success');
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Pindahkan ${selectedFileIds.length} berkas ke sampah?`)) return;

    const items: ActivityItem[] = selectedFileIds.map((id, i) => {
      const f = files.find(f => f.id === id);
      return { id: `bulk-del-${i}`, op: 'delete', name: f?.name ?? id, itemType: 'file', status: 'pending' };
    });
    setActivityQueue(prev => [...prev, ...items]);
    setShowActivityPanel(true);
    if (activityPanelTimerRef.current) clearTimeout(activityPanelTimerRef.current);

    let successCount = 0;
    for (let i = 0; i < selectedFileIds.length; i++) {
      const fileId = selectedFileIds[i];
      const queueId = items[i].id;
      setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'active' } : q));
      try {
        await axios.delete(`${BACKEND_URL}/api/files/${fileId}`);
        setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'done' } : q));
        successCount++;
      } catch {
        setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'error', errorMsg: 'Gagal' } : q));
      }
    }

    setSelectedFileIds([]);
    setSelectedFile(null);
    fetchFiles();
    fetchTrash();
    activityPanelTimerRef.current = setTimeout(() => {
      setShowActivityPanel(false);
      setActivityQueue([]);
    }, 5000);
  };

  const handleBulkRestore = async () => {
    const items: ActivityItem[] = selectedFileIds.map((id, i) => {
      const f = trashFiles.find(f => f.id === id);
      return { id: `bulk-restore-${i}`, op: 'restore', name: f?.name ?? id, itemType: 'file', status: 'pending' };
    });
    setActivityQueue(prev => [...prev, ...items]);
    setShowActivityPanel(true);
    if (activityPanelTimerRef.current) clearTimeout(activityPanelTimerRef.current);

    for (let i = 0; i < selectedFileIds.length; i++) {
      const fileId = selectedFileIds[i];
      const queueId = items[i].id;
      setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'active' } : q));
      try {
        await axios.post(`${BACKEND_URL}/api/files/${fileId}/restore`);
        setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'done' } : q));
      } catch {
        setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'error', errorMsg: 'Gagal' } : q));
      }
    }

    setSelectedFileIds([]);
    fetchFiles();
    fetchTrash();
    activityPanelTimerRef.current = setTimeout(() => {
      setShowActivityPanel(false);
      setActivityQueue([]);
    }, 5000);
  };

  const handleBulkPermanentDelete = async () => {
    if (!window.confirm(`Hapus permanen ${selectedFileIds.length} berkas? Tindakan ini tidak dapat dibatalkan.`)) return;

    const items: ActivityItem[] = selectedFileIds.map((id, i) => {
      const f = trashFiles.find(f => f.id === id);
      return { id: `bulk-perm-del-${i}`, op: 'permanent-delete', name: f?.name ?? id, itemType: 'file', status: 'pending' };
    });
    setActivityQueue(prev => [...prev, ...items]);
    setShowActivityPanel(true);
    if (activityPanelTimerRef.current) clearTimeout(activityPanelTimerRef.current);

    for (let i = 0; i < selectedFileIds.length; i++) {
      const fileId = selectedFileIds[i];
      const queueId = items[i].id;
      setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'active' } : q));
      try {
        await axios.delete(`${BACKEND_URL}/api/files/${fileId}/permanent`);
        setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'done' } : q));
      } catch {
        setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'error', errorMsg: 'Gagal' } : q));
      }
    }

    setSelectedFileIds([]);
    fetchTrash();
    activityPanelTimerRef.current = setTimeout(() => {
      setShowActivityPanel(false);
      setActivityQueue([]);
    }, 5000);
  };

  const uploadMultipleFiles = async (filesWithPaths: { file: File; relativePath: string }[]) => {
    if (!currentUser?.email || filesWithPaths.length === 0) return;
    setIsUploading(true);

    // Buat queue items untuk unified activity queue (semua mulai sebagai pending)
    const queueItems: ActivityItem[] = filesWithPaths.map((item, i) => ({
      id: `upload-${Date.now()}-${i}`,
      name: item.file.name,
      size: item.file.size,
      progress: 0,
      status: 'pending',
      op: 'upload' as ActivityOp,
    }));

    setActivityQueue(prev => [...prev, ...queueItems]);
    setShowActivityPanel(true);
    if (activityPanelTimerRef.current) clearTimeout(activityPanelTimerRef.current);

    // Deteksi apakah ini upload folder (ada relativePath dengan '/')
    const isFolderUpload = filesWithPaths.some(f => f.relativePath.includes('/'));

    let errorCount = 0;
    const CONCURRENCY_LIMIT = 5;
    let index = 0;

    const runNext = async (): Promise<void> => {
      if (index >= filesWithPaths.length) return;
      const currentIndex = index++;
      const { file, relativePath } = filesWithPaths[currentIndex];
      const queueId = queueItems[currentIndex].id;

      // Set status ke active dan progress 0 saat mulai upload
      setActivityQueue(prev => prev.map(q =>
        q.id === queueId ? { ...q, status: 'active', progress: 0 } : q
      ));

      try {
        const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
        const uploadId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);

          const formData = new FormData();
          formData.append('chunk', chunk, file.name); // Kirim filename di Form Data
          formData.append('upload_id', uploadId);
          formData.append('chunk_index', chunkIndex.toString());
          formData.append('total_chunks', totalChunks.toString());
          formData.append('file_name', file.name);
          formData.append('file_size', file.size.toString());
          formData.append('owner', currentUser.email);

          if (activeNav === 'folders' && selectedFolder) {
            formData.append('folder_id', selectedFolder.id);
          } else if (isFolderUpload) {
            const parts = relativePath.split('/');
            if (parts.length > 1) {
              formData.append('folder_name', parts[0]);
            }
          }

          await axios.post(`${BACKEND_URL}/api/upload-chunk`, formData, {
            onUploadProgress: (evt) => {
              const chunkUploaded = evt.total ? evt.loaded : 0;
              const totalUploaded = start + chunkUploaded;
              const pct = Math.min(Math.round((totalUploaded / file.size) * 100), 99); // max 99% sampai server menggabungkan chunk
              setActivityQueue(prev => prev.map(q =>
                q.id === queueId ? { ...q, progress: pct } : q
              ));
            },
          });
        }

        setActivityQueue(prev => prev.map(q =>
          q.id === queueId ? { ...q, status: 'done', progress: 100 } : q
        ));
      } catch (err: any) {
        console.error('Upload failed:', err);
        const msg = err?.response?.data?.error || 'Gagal mengunggah';
        setActivityQueue(prev => prev.map(q =>
          q.id === queueId ? { ...q, status: 'error', errorMsg: msg } : q
        ));
        errorCount++;
      }

      // Jalankan file berikutnya di queue
      await runNext();
    };

    // Mulai worker upload secara paralel (maksimal 5)
    const promises: Promise<void>[] = [];
    for (let c = 0; c < Math.min(CONCURRENCY_LIMIT, filesWithPaths.length); c++) {
      promises.push(runNext());
    }
    await Promise.all(promises);

    // Refresh data setelah semua selesai
    fetchFiles();
    fetchFolders();
    fetchStorageStats();
    setIsUploading(false);

    // Auto-tutup panel setelah 6 detik jika semua sukses
    if (errorCount === 0) {
      activityPanelTimerRef.current = setTimeout(() => {
        setShowActivityPanel(false);
        setActivityQueue([]);
      }, 6000);
    }
  };

  const handleNormalFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    const filesWithPaths = Array.from(uploadedFiles).map(file => ({
      file,
      relativePath: file.name
    }));

    await uploadMultipleFiles(filesWithPaths);
    if (e.target) e.target.value = '';
  };

  const handleFolderDirectoryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    const filesWithPaths = Array.from(uploadedFiles).map(file => ({
      file,
      relativePath: (file as any).webkitRelativePath || file.name
    }));

    await uploadMultipleFiles(filesWithPaths);
    if (e.target) e.target.value = '';
  };

  const getFilesFromEntry = async (entry: any, pathStr = ''): Promise<{ file: File; relativePath: string }[]> => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file: File) => {
          resolve([{ file, relativePath: pathStr + file.name }]);
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const readAllEntries = async () => {
          let allEntries: any[] = [];
          const readBatch = (): Promise<any[]> => {
            return new Promise((resBatch) => {
              dirReader.readEntries((entries: any[]) => {
                resBatch(entries);
              });
            });
          };
          let batch = await readBatch();
          while (batch.length > 0) {
            allEntries = [...allEntries, ...batch];
            batch = await readBatch();
          }
          const filePromises = allEntries.map(e => getFilesFromEntry(e, pathStr + entry.name + '/'));
          const filesArrays = await Promise.all(filePromises);
          resolve(filesArrays.flat());
        };
        readAllEntries();
      } else {
        resolve([]);
      }
    });
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    dragCounter.current = 0;

    const items = e.dataTransfer.items;
    if (!items || items.length === 0 || !currentUser?.email) return;

    const promises: Promise<{ file: File; relativePath: string }[]>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
      if (entry) {
        promises.push(getFilesFromEntry(entry));
      } else {
        const file = item.getAsFile();
        if (file) {
          promises.push(Promise.resolve([{ file, relativePath: file.name }]));
        }
      }
    }

    const fileListWithPaths = (await Promise.all(promises)).flat();
    if (fileListWithPaths.length === 0) return;

    await uploadMultipleFiles(fileListWithPaths);
  };

  const fetchFiles = async () => {
    if (!currentUser?.email) return;
    setIsLoadingFiles(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/files?owner=${encodeURIComponent(currentUser.email)}`);
      setFiles(res.data);
    } catch {
      showToast('Gagal memuat berkas. Pastikan server backend berjalan.', 'error');
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const fetchFolders = async () => {
    if (!currentUser?.email) return;
    try {
      const res = await axios.get(`${BACKEND_URL}/api/folders?owner=${encodeURIComponent(currentUser.email)}`);
      setFolders(res.data);
    } catch {
      showToast('Gagal memuat folder.', 'error');
    }
  };

  const fetchTrash = async () => {
    if (!currentUser?.email) return;
    try {
      const res = await axios.get(`${BACKEND_URL}/api/trash?owner=${encodeURIComponent(currentUser.email)}`);
      setTrashFiles(res.data);
    } catch {
      // Trash endpoint may not be available yet (column migration pending)
    }
  };

  const fetchStorageStats = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/storage-stats`);
      setStorageStats(res.data);
    } catch {
      // Fallback to calculating from files if endpoint fails
    }
  };

  const fetchNotifications = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await axios.get(`${BACKEND_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data: Notification[] = res.data || [];
      
      setNotifications(prev => {
        if (prev.length > 0) {
          const prevIds = new Set(prev.map(n => n.id));
          data.forEach(n => {
            if (!prevIds.has(n.id)) {
              showToast(`${n.shared_by} membagikan ${n.item_type === 'folder' ? 'folder' : 'file'} "${n.item_name}" dengan Anda`, 'success');
            }
          });
        }
        return data;
      });

      const lastCheck = lastNotifCheck || localStorage.getItem('syncnu_last_notif_check');
      const unread = lastCheck
        ? data.filter(n => new Date(n.created_at) > new Date(lastCheck)).length
        : data.length;
      setUnreadNotifCount(unread);
    } catch {
      // Notifications endpoint may not be available yet
    }
  };

  const fetchSharedItems = async (silent = false) => {
    const token = getToken();
    if (!token) return;
    if (!silent) setIsLoadingShared(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/shared`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSharedItems(res.data);
    } catch {
      if (!silent) showToast('Gagal memuat file dibagikan.', 'error');
    } finally {
      if (!silent) setIsLoadingShared(false);
    }
  };

  const fetchExistingShares = async (type: 'file' | 'folder', id: string) => {
    const token = getToken();
    if (!token) return;
    setIsLoadingExistingShares(true);
    try {
      const url = `${BACKEND_URL}/api/shares?${type === 'file' ? 'file_id' : 'folder_id'}=${id}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setExistingShares(res.data || []);
    } catch (err) {
      console.error('Error fetching shares:', err);
    } finally {
      setIsLoadingExistingShares(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    const token = getToken();
    if (!token || !shareItem) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/shares/${shareId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast('Akses berhasil dihapus', 'success');
      fetchExistingShares(shareItem.type, shareItem.id);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Gagal menghapus akses.';
      showToast(msg, 'error');
    }
  };

  const handleOpenShareModal = (type: 'file' | 'folder', id: string, name: string) => {
    setShareItem({ type, id, name });
    setShareEmail('');
    setShareLink('');
    setShareTab('email');
    setExistingShares([]);
    setShowShareModal(true);
    fetchExistingShares(type, id);
  };

  const handleShareViaEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareItem || !shareEmail) return;
    const token = getToken();
    if (!token) return;
    setIsSharing(true);
    try {
      await axios.post(`${BACKEND_URL}/api/shares`, {
        file_id: shareItem.type === 'file' ? shareItem.id : '',
        folder_id: shareItem.type === 'folder' ? shareItem.id : '',
        share_type: 'email',
        shared_to: shareEmail.trim()
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast(`Berhasil dibagikan ke ${shareEmail}`, 'success');
      setShareEmail('');
      fetchExistingShares(shareItem.type, shareItem.id);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Gagal membagikan.';
      showToast(msg, 'error');
    } finally {
      setIsSharing(false);
    }
  };

  const handleGenerateShareLink = async () => {
    if (!shareItem) return;
    const token = getToken();
    if (!token) return;
    setIsSharing(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/shares`, {
        file_id: shareItem.type === 'file' ? shareItem.id : '',
        folder_id: shareItem.type === 'folder' ? shareItem.id : '',
        share_type: 'link'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const generatedLink = `${window.location.origin}/share/${res.data.token}`;
      setShareLink(generatedLink);
      showToast('Link berhasil dibuat', 'success');
      fetchExistingShares(shareItem.type, shareItem.id);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Gagal membuat link.';
      showToast(msg, 'error');
    } finally {
      setIsSharing(false);
    }
  };

  const fetchPublicShareData = async () => {
    if (!publicShareToken) return;
    setIsLoadingPublicShare(true);
    setPublicShareError(null);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/shares/public/${publicShareToken}`);
      setPublicShareData(res.data);
    } catch (err: any) {
      console.error(err);
      setPublicShareError(err?.response?.data?.error || 'Link berbagi tidak valid atau telah kadaluarsa.');
    } finally {
      setIsLoadingPublicShare(false);
    }
  };

  useEffect(() => {
    if (selectedSharedFolder) {
      const updatedFolder = sharedItems.find(item => item.share_id === selectedSharedFolder.share_id);
      if (updatedFolder) {
        setSelectedSharedFolder(updatedFolder);
      } else {
        setSelectedSharedFolder(null);
      }
    }
  }, [sharedItems]);

  useEffect(() => {
    if (publicShareToken) {
      fetchPublicShareData();
    }
  }, [publicShareToken]);

  useEffect(() => {
    let interval: any;
    if (activeNav === 'shared' && isAuthenticated && currentUser) {
      fetchSharedItems(false);
      interval = setInterval(() => {
        fetchSharedItems(true);
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeNav, isAuthenticated, currentUser]);

  useEffect(() => {
    // Check if path is /logout on startup
    if (window.location.pathname === '/logout') {
      clearToken();
      setIsAuthenticated(false);
      setCurrentUser(null);
      window.history.replaceState({}, '', '/');
      return;
    }

    // Cek token yang tersimpan di localStorage
    const token = getToken();
    if (!token) {
      setIsAuthenticated(false);
      setCurrentUser(null);
      return;
    }
    // Verifikasi token ke backend
    axios.get(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      const { username, email, name } = res.data.user;
      const initials = (name || username).slice(0, 2).toUpperCase();
      setIsAuthenticated(true);
      setCurrentUser({ name: name || username, email, initials });
    }).catch(() => {
      clearToken();
      setIsAuthenticated(false);
      setCurrentUser(null);
    });
  }, []);

  useEffect(() => {
    if (isAuthenticated && currentUser) {
      fetchFiles();
      fetchFolders();
      fetchStorageStats();
      fetchNotifications();
    } else {
      setFiles([]);
      setFolders([]);
      setStorageStats(null);
      setNotifications([]);
      setUnreadNotifCount(0);
    }
  }, [isAuthenticated, currentUser]);

  // Poll notifications every 30 seconds
  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    const interval = setInterval(() => {
      fetchNotifications();
    }, 30_000);
    return () => clearInterval(interval);
  }, [isAuthenticated, currentUser]);

  // Close notification panel on outside click
  useEffect(() => {
    if (!showNotifPanel) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node)) {
        setShowNotifPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifPanel]);

  // Close menus on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  useEffect(() => {
    if (activeNav === 'trash' && isAuthenticated && currentUser) {
      fetchTrash();
    }
  }, [activeNav, isAuthenticated, currentUser]);

  // Cleanup activity panel timer on unmount
  useEffect(() => {
    return () => {
      if (activityPanelTimerRef.current) clearTimeout(activityPanelTimerRef.current);
    };
  }, []);

  const handleLogin = async (username: string, pass: string) => {
    try {
      const res = await axios.post(`${BACKEND_URL}/api/auth/login`, { username, password: pass });
      const { token, user } = res.data;
      setToken(token);
      const initials = (user.name || user.username).slice(0, 2).toUpperCase();
      setCurrentUser({ name: user.name || user.username, email: user.email, initials });
      setIsAuthenticated(true);
      return { success: true };
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Username atau password salah.';
      return { success: false, message: msg };
    }
  };

  const handleRegister = async (username: string, email: string, pass: string, name: string) => {
    try {
      await axios.post(`${BACKEND_URL}/api/auth/register`, { username, email, password: pass, name });
      return { success: true };
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Pendaftaran gagal.';
      return { success: false, message: msg };
    }
  };

  const handleLogout = () => {
    clearToken();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setShowUserMenu(false);
    window.history.replaceState({}, '', '/');
  };

  const handleFileDelete = async (id: string, name: string) => {
    if (!window.confirm(`Pindahkan berkas "${name}" ke sampah?`)) return;

    const queueId = `del-${Date.now()}`;
    const item: ActivityItem = { id: queueId, op: 'delete', name, itemType: 'file', status: 'active' };
    setActivityQueue(prev => [...prev, item]);
    setShowActivityPanel(true);
    if (activityPanelTimerRef.current) clearTimeout(activityPanelTimerRef.current);

    try {
      await axios.delete(`${BACKEND_URL}/api/files/${id}`);
      setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'done' } : q));
      if (selectedFile?.id === id) setSelectedFile(null);
      fetchFiles();
      fetchTrash();
    } catch {
      setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'error', errorMsg: 'Gagal menghapus' } : q));
    } finally {
      activityPanelTimerRef.current = setTimeout(() => {
        setShowActivityPanel(false);
        setActivityQueue([]);
      }, 5000);
    }
  };

  const handleRestoreFile = async (id: string, name: string) => {
    const queueId = `restore-${Date.now()}`;
    const item: ActivityItem = { id: queueId, op: 'restore', name, itemType: 'file', status: 'active' };
    setActivityQueue(prev => [...prev, item]);
    setShowActivityPanel(true);
    if (activityPanelTimerRef.current) clearTimeout(activityPanelTimerRef.current);

    try {
      await axios.post(`${BACKEND_URL}/api/files/${id}/restore`);
      setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'done' } : q));
      fetchFiles();
      fetchTrash();
    } catch {
      setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'error', errorMsg: 'Gagal memulihkan' } : q));
    } finally {
      activityPanelTimerRef.current = setTimeout(() => {
        setShowActivityPanel(false);
        setActivityQueue([]);
      }, 5000);
    }
  };

  const handlePermanentDelete = async (id: string, name: string) => {
    if (!window.confirm(`Hapus permanen berkas "${name}"? Tindakan ini tidak dapat dibatalkan.`)) return;

    const queueId = `perm-del-${Date.now()}`;
    const item: ActivityItem = { id: queueId, op: 'permanent-delete', name, itemType: 'file', status: 'active' };
    setActivityQueue(prev => [...prev, item]);
    setShowActivityPanel(true);
    if (activityPanelTimerRef.current) clearTimeout(activityPanelTimerRef.current);

    try {
      await axios.delete(`${BACKEND_URL}/api/files/${id}/permanent`);
      setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'done' } : q));
      fetchTrash();
    } catch {
      setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'error', errorMsg: 'Gagal menghapus permanen' } : q));
    } finally {
      activityPanelTimerRef.current = setTimeout(() => {
        setShowActivityPanel(false);
        setActivityQueue([]);
      }, 5000);
    }
  };

  const handleDeleteFolder = async (id: string, name: string) => {
    // Hitung file di dalam folder
    const folderFileCount = files.filter(f => f.folder_id === id).length;
    const confirmMsg = folderFileCount > 0
      ? `Hapus folder "${name}"? ${folderFileCount} file di dalamnya akan dipindahkan ke sampah.`
      : `Hapus folder "${name}"?`;
    if (!window.confirm(confirmMsg)) return;

    const queueId = `del-folder-${Date.now()}`;
    const item: ActivityItem = { id: queueId, op: 'delete', name, itemType: 'folder', fileCount: folderFileCount, status: 'active' };
    setActivityQueue(prev => [...prev, item]);
    setShowActivityPanel(true);
    if (activityPanelTimerRef.current) clearTimeout(activityPanelTimerRef.current);

    try {
      await axios.delete(`${BACKEND_URL}/api/folders/${id}`);
      setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'done' } : q));
      if (selectedFolder?.id === id) setSelectedFolder(null);
      fetchFolders();
      fetchFiles();
      fetchTrash();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Gagal menghapus folder';
      setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'error', errorMsg: msg } : q));
    } finally {
      activityPanelTimerRef.current = setTimeout(() => {
        setShowActivityPanel(false);
        setActivityQueue([]);
      }, 5000);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !currentUser?.email) return;

    const queueId = `create-folder-${Date.now()}`;
    const folderName = newFolderName.trim();
    const item: ActivityItem = { id: queueId, op: 'create-folder', name: folderName, itemType: 'folder', status: 'active' };
    setActivityQueue(prev => [...prev, item]);
    setShowActivityPanel(true);
    if (activityPanelTimerRef.current) clearTimeout(activityPanelTimerRef.current);

    try {
      await axios.post(`${BACKEND_URL}/api/folders`, {
        name: folderName,
        owner: currentUser.email
      });
      setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'done' } : q));
      fetchFolders();
    } catch {
      setActivityQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'error', errorMsg: 'Gagal membuat folder' } : q));
    } finally {
      setNewFolderName('');
      setIsCreatingFolder(false);
      activityPanelTimerRef.current = setTimeout(() => {
        setShowActivityPanel(false);
        setActivityQueue([]);
      }, 5000);
    }
  };

  // Storage stats — prefer real disk usage from backend, fallback to file metadata sum
  const totalUsed = storageStats?.used ?? files.reduce((a, f) => a + f.size, 0);
  const usedPct = Math.min((totalUsed / (storageStats?.total ?? (100 * 1024 * 1024 * 1024))) * 100, 100);

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const homeFiles = filteredFiles.slice(0, 20);
  const recentFiles = [...files].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 4);

  if (publicShareToken) {
    if (isLoadingPublicShare) {
      return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
          <div className="text-center">
            <svg className="h-8 w-8 animate-spin text-blue-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-sm text-slate-400 mt-3 font-semibold">Memuat halaman berbagi...</p>
          </div>
        </div>
      );
    }
    if (publicShareError) {
      return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4" style={{
          backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.12) 0%, transparent 60%)'
        }}>
          <div className="bg-[#1e293b] border border-[#334155] rounded-2xl p-8 shadow-2xl max-w-sm text-center">
            <svg className="h-12 w-12 text-red-500/80 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <h2 className="text-lg font-bold text-white mb-2">Tautan Tidak Valid</h2>
            <p className="text-xs text-slate-400 mb-6 font-medium leading-relaxed">{publicShareError}</p>
            <button
              onClick={() => {
                setPublicShareToken(null);
                window.history.replaceState({}, '', '/');
              }}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-500 transition-all w-full shadow-lg shadow-blue-500/20"
            >
              Kembali ke Login
            </button>
          </div>
        </div>
      );
    }
    if (publicShareData) {
      const isFile = publicShareData.type === 'file';
      return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4" style={{
          backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.12) 0%, transparent 60%)'
        }}>
          <div className="w-full max-w-md">
            {/* Logo */}
            <div className="flex items-center gap-1.5 mb-8 justify-center">
              <img src="/icon.png" alt="Syncnu" className="w-11 h-11 rounded-xl object-contain" />
              <span className="font-bold text-xl text-white tracking-tight">Syncnu</span>
            </div>

            <div className="bg-[#1e293b] border border-[#334155] rounded-2xl p-8 shadow-2xl relative">
              <h2 className="text-lg font-bold text-white mb-1 text-center">Unduh Berkas Bersama</h2>
              <p className="text-xs text-slate-400 text-center mb-6 font-medium">Dibagikan oleh <span className="text-blue-400 font-semibold">{publicShareData.shared_by}</span></p>

              {isFile ? (
                <div className="space-y-6">
                  {/* File preview */}
                  <FilePreview file={publicShareData.file} backendUrl={BACKEND_URL} />
                  
                  {/* File Info */}
                  <div className="bg-[#0f172a]/60 border border-[#334155]/60 rounded-xl p-4 flex justify-between items-center text-sm">
                    <div className="min-w-0 flex-1 pr-4">
                      <p className="font-semibold text-slate-200 truncate text-xs">{publicShareData.file.name}</p>
                      <p className="text-[10px] text-slate-500 mt-1 font-medium">{formatBytes(publicShareData.file.size)} · {timeAgo(publicShareData.file.created_at)}</p>
                    </div>
                    <a
                      href={`${BACKEND_URL}${publicShareData.file.path}`}
                      download={publicShareData.file.name}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-all shadow-lg shadow-blue-500/20 shrink-0"
                    >
                      Unduh
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 bg-[#0f172a]/40 border border-[#334155]/60 rounded-xl p-4">
                    <IconFolder cls="h-10 w-10 text-blue-400/80 fill-current shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-200 text-sm">{publicShareData.folder.name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{publicShareData.files?.length || 0} berkas</p>
                    </div>
                  </div>

                  {/* Files inside folder */}
                  <div className="bg-[#0f172a] rounded-xl border border-[#334155] overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-[#334155]/60 bg-[#111827]/40">
                          <th className="py-2.5 px-4">Nama</th>
                          <th className="py-2.5 px-4 w-28 text-right">Ukuran</th>
                          <th className="py-2.5 px-4 w-16" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#334155]/40 text-xs text-slate-300">
                        {(publicShareData.files || []).map((file: any) => {
                          const { label, bg } = getFileExtLabel(file.type, file.name);
                          return (
                            <tr key={file.id} className="hover:bg-[#1e293b]/50 transition-colors">
                              <td className="py-2.5 px-4 flex items-center gap-2 min-w-0">
                                <span className={`${bg} text-white rounded w-6 h-6 flex items-center justify-center text-[8px] font-bold shrink-0`}>{label}</span>
                                <span className="truncate max-w-[140px] font-medium text-slate-200">{file.name}</span>
                              </td>
                              <td className="py-2.5 px-4 text-slate-400 text-right">{formatBytes(file.size)}</td>
                              <td className="py-2.5 px-4 text-center">
                                <a
                                  href={`${BACKEND_URL}${file.path}`}
                                  download={file.name}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-400 hover:text-blue-300 font-semibold"
                                >
                                  Unduh
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              <div className="mt-8 pt-5 border-t border-[#334155] text-center">
                <button
                  onClick={() => {
                    setPublicShareToken(null);
                    window.history.replaceState({}, '', '/');
                  }}
                  className="text-xs text-slate-500 hover:text-blue-400 font-medium transition"
                >
                  Kembali ke Login
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  if (!isAuthenticated || !currentUser) return <LoginPage onLogin={handleLogin} onRegister={handleRegister} />;

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-[#0f172a] text-slate-100" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border flex items-center gap-3 shadow-2xl text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {toast.text}
        </div>
      )}

      {/* ── Mobile Sidebar Overlay ── */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* ── Top Navigation Bar ── */}
      <header className="bg-[#111827] border-b border-[#1e293b] flex items-center justify-between px-4 shrink-0 z-30 h-[52px]">
        {/* Hamburger (mobile only) + Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="md:hidden p-2 text-slate-400 hover:text-slate-200 hover:bg-[#1e293b] rounded-lg transition"
            onClick={() => setIsMobileSidebarOpen(v => !v)}
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5">
            <img src="/icon.png" alt="Syncnu" className="w-8 h-8 rounded-xl object-contain shrink-0" />
            <span className="font-bold text-sm text-white tracking-tight hidden sm:block">Syncnu</span>
          </div>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-lg px-3">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500"><IconSearch /></span>
            <input
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#1e293b] border border-[#334155] rounded-lg py-2 pl-9 pr-4 text-sm text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:outline-none placeholder:text-slate-500"
              placeholder="Cari file..." type="text"
            />
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Notification bell */}
          <div className="relative" ref={notifPanelRef}>
            <button
              onClick={() => {
                setShowNotifPanel(v => !v);
                if (!showNotifPanel) {
                  const now = new Date().toISOString();
                  localStorage.setItem('syncnu_last_notif_check', now);
                  setLastNotifCheck(now);
                  setUnreadNotifCount(0);
                }
              }}
              className="relative p-2 text-slate-400 hover:text-slate-200 hover:bg-[#1e293b] rounded-lg transition"
              title="Notifikasi"
            >
              <IconBell />
              {unreadNotifCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-[#111827]" />
              )}
            </button>

            {/* Notification dropdown panel */}
            {showNotifPanel && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-2 w-80 bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl z-50 overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#334155]">
                  <span className="text-sm font-semibold text-white">Notifikasi</span>
                  <button
                    onClick={() => setShowNotifPanel(false)}
                    className="p-1 text-slate-500 hover:text-slate-300 rounded transition"
                  >
                    <IconX />
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-[#334155]/50">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <IconBell />
                      <p className="text-sm font-medium text-slate-400 mt-3">Belum ada notifikasi</p>
                      <p className="text-xs text-slate-500 mt-1">Notifikasi berbagi akan muncul di sini</p>
                    </div>
                  ) : (
                    notifications.map(notif => (
                      <div key={notif.id} className="px-4 py-3 hover:bg-[#0f172a]/40 transition">
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${notif.item_type === 'folder' ? 'bg-blue-500/15' : 'bg-emerald-500/15'}`}>
                            {notif.item_type === 'folder'
                              ? <IconFolder cls="h-4 w-4 text-blue-400 fill-current" />
                              : <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-200 leading-relaxed">
                              <span className="font-semibold text-blue-400">{notif.shared_by}</span>
                              {' '}membagikan {notif.item_type === 'folder' ? 'folder' : 'file'}{' '}
                              <span className="font-semibold text-slate-100">"{notif.item_name}"</span>
                              {' '}kepada Anda
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{timeAgo(notif.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {notifications.length > 0 && (
                  <div className="px-4 py-2.5 border-t border-[#334155]">
                    <button
                      onClick={() => { setActiveNav('shared'); setShowNotifPanel(false); }}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium transition"
                    >
                      Lihat semua yang dibagikan →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button className="hidden sm:block p-2 text-slate-400 hover:text-slate-200 hover:bg-[#1e293b] rounded-lg transition" title="Pengaturan"><IconSettings /></button>
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              className="flex items-center gap-2 cursor-pointer hover:bg-[#1e293b] px-2 py-1.5 rounded-lg transition"
            >
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[11px] font-bold shadow-lg shrink-0">{currentUser.initials}</div>
              <span className="text-sm font-medium text-slate-200 hidden md:block">{currentUser.name}</span>
              <IconChevronDown />
            </button>
            {showUserMenu && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1.5 w-48 bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl z-50 py-1.5 text-sm overflow-hidden"
              >
                <div className="px-3.5 py-2.5 border-b border-[#334155]">
                  <p className="font-semibold text-white text-sm">{currentUser.name}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{currentUser.email}</p>
                </div>
                <button onClick={handleLogout} className="w-full text-left px-3.5 py-2.5 text-red-400 hover:bg-red-500/10 transition font-medium text-sm">Keluar</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">

        {/* ── Left Sidebar ── */}
        <aside className={`
          fixed md:relative inset-y-0 left-0 z-50 md:z-auto
          w-64 md:w-56 bg-[#111827] border-r border-[#1e293b]
          overflow-y-auto flex flex-col py-4 shrink-0
          transform transition-transform duration-300 ease-in-out
          ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          {/* Mobile close button */}
          <div className="flex items-center justify-between px-4 mb-2 md:hidden">
            <div className="flex items-center gap-1.5">
              <img src="/icon.png" alt="Syncnu" className="w-7 h-7 rounded-lg object-contain" />
              <span className="font-bold text-sm text-white">Syncnu</span>
            </div>
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg transition"
            >
              <IconX />
            </button>
          </div>
          <nav className="flex-1 px-3">
            {/* Main nav */}
            <ul className="space-y-0.5">
              {([
                { key: 'home', label: 'Beranda', icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg> },
                { key: 'folders', label: 'My Drive', icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg> },
                { key: 'recent', label: 'Terbaru', icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg> },
                { key: 'shared', label: 'Dibagikan', icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg> },
                { key: 'starred', label: 'Favorit', icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg> },
                { key: 'trash', label: 'Sampah', icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg> },
              ] as { key: ActiveNav; label: string; icon: React.ReactNode }[]).map(item => (
                <li key={item.key}>
                  <button
                    onClick={() => {
                      setActiveNav(item.key);
                      setSelectedFolder(null);
                      setSelectedSharedFolder(null);
                      setSelectedFileIds([]);
                      setIsMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition sidebar-item ${activeNav === item.key ? 'sidebar-item-active text-blue-400' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]'}`}
                  >
                    {item.icon}{item.label}
                    {item.key === 'trash' && trashFiles.length > 0 && (
                      <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full ${activeNav === 'trash' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
                        {trashFiles.length}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {/* Storage */}
            <div className="mt-6">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">Penyimpanan</p>
              <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-3.5 mx-0.5">
                <div className="flex justify-between items-end text-xs mb-2">
                  <span className="font-semibold text-white">{formatBytes(totalUsed)}</span>
                  <span className="text-slate-500 text-[11px]">dari {formatBytes(storageStats?.total ?? 100 * 1024 * 1024 * 1024)}</span>
                </div>
                <div className="w-full bg-[#0f172a] rounded-full h-1.5 mb-2.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${usedPct > 80 ? 'bg-red-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.max(usedPct, 1)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mb-3">
                  <span>{files.length} file · {folders.length} folder</span>
                  <span>{storageStats ? `${formatBytes(storageStats.free)} bebas` : `${usedPct.toFixed(1)}%`}</span>
                </div>
                <button
                  onClick={() => fetchStorageStats()}
                  className="w-full py-1.5 border border-[#334155] rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-200 hover:border-[#475569] transition"
                >
                  Kelola penyimpanan
                </button>
              </div>
            </div>

            {/* My Folders */}
            <div className="mt-6">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">Folder Saya</p>
              <ul className="space-y-0.5">
                {folders.map(f => (
                  <li key={f.id}>
                    <button
                      onClick={() => { setActiveNav('folders'); setSelectedFolder(f); setSelectedFileIds([]); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-400 hover:text-slate-200 hover:bg-[#1e293b] rounded-lg text-sm font-medium transition"
                    >
                      <IconFolder cls="h-4 w-4 text-blue-400/70 fill-current shrink-0" />{f.name}
                    </button>
                  </li>
                ))}
                <li className="pt-1">
                  <button onClick={() => setIsCreatingFolder(true)} className="flex items-center gap-2.5 px-3 py-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 w-full rounded-lg text-sm font-medium transition">
                    <IconPlus />Buat folder baru
                  </button>
                </li>
              </ul>
            </div>
          </nav>
        </aside>
        {/* ── End Left Sidebar ── */}
        <main
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="flex-1 overflow-y-auto p-6 min-w-0 bg-[#0f172a] relative"
        >
          {isDragActive && (
            <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-md border-2 border-dashed border-blue-500/50 rounded-2xl m-4 z-40 flex flex-col items-center justify-center pointer-events-none transition-all">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4 shadow-lg shadow-blue-500/10 animate-bounce">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              <p className="text-lg font-bold text-slate-200">Lepaskan untuk mengunggah</p>
              <p className="text-sm text-slate-400 mt-1">Seret berkas atau folder ke sini</p>
            </div>
          )}
          <div className="max-w-[1000px] mx-auto">

            {/* Page header */}
            <header className="flex justify-between items-end mb-6">
              <div>
                {activeNav === 'folders' && selectedFolder ? (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelectedFolder(null)} className="text-blue-400 hover:text-blue-300 text-sm font-medium transition">My Drive</button>
                    <span className="text-slate-600">/</span>
                    <h1 className="text-2xl font-bold text-white">{selectedFolder.name}</h1>
                  </div>
                ) : (
                  <h1 className="text-2xl font-bold text-white">
                    {activeNav === 'home' && 'Beranda'}
                    {activeNav === 'folders' && 'My Drive'}
                    {activeNav === 'recent' && 'Terbaru'}
                    {activeNav === 'shared' && 'Dibagikan'}
                    {activeNav === 'starred' && 'Favorit'}
                    {activeNav === 'trash' && 'Sampah'}
                  </h1>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { fetchFiles(); fetchFolders(); }} title="Refresh" className="p-2 text-slate-500 hover:text-slate-300 hover:bg-[#1e293b] border border-transparent hover:border-[#334155] rounded-lg transition">
                  <IconRefresh spin={isLoadingFiles} />
                </button>
                {(activeNav === 'home' || activeNav === 'folders') && (
                  <div className="relative">
                    <button
                      onClick={() => setShowUploadMenu(v => !v)}
                      disabled={isUploading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition disabled:opacity-50 shadow-lg shadow-blue-500/20"
                    >
                      <IconPlus />
                      <span>{isUploading ? 'Mengunggah...' : 'Tambah Baru'}</span>
                      <IconChevronDown cls="h-3.5 w-3.5 text-white shrink-0 ml-1" />
                    </button>
                    {showUploadMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowUploadMenu(false)} />
                        <div className="absolute right-0 top-full mt-1.5 w-48 bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl z-50 py-1.5 text-sm overflow-hidden">
                          <button
                            onClick={() => {
                              setShowUploadMenu(false);
                              if (fileInputRef.current) {
                                if (activeNav === 'folders' && selectedFolder) {
                                  fileInputRef.current.accept = getFolderAccept(selectedFolder.name);
                                } else {
                                  fileInputRef.current.accept = '';
                                }
                                fileInputRef.current.click();
                              }
                            }}
                            className="w-full text-left px-3.5 py-2.5 text-slate-200 hover:bg-[#243347] transition flex items-center gap-2"
                          >
                            <svg className="h-4 w-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            <span>Unggah File</span>
                          </button>
                          <button
                            onClick={() => {
                              setShowUploadMenu(false);
                              if (folderDirUploadRef.current) {
                                if (activeNav === 'folders' && selectedFolder) {
                                  folderDirUploadRef.current.accept = getFolderAccept(selectedFolder.name);
                                } else {
                                  folderDirUploadRef.current.accept = '';
                                }
                                folderDirUploadRef.current.click();
                              }
                            }}
                            className="w-full text-left px-3.5 py-2.5 text-slate-200 hover:bg-[#243347] transition flex items-center gap-2"
                          >
                            <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                            <span>Unggah Folder</span>
                          </button>
                          <div className="border-t border-[#334155] my-1" />
                          <button
                            onClick={() => { setShowUploadMenu(false); setIsCreatingFolder(true); }}
                            className="w-full text-left px-3.5 py-2.5 text-slate-200 hover:bg-[#243347] transition flex items-center gap-2"
                          >
                            <svg className="h-4 w-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            <span>Buat Folder</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <input type="file" ref={fileInputRef} onChange={handleNormalFilesUpload} multiple className="hidden" />

                {/* Input khusus upload folder/direktori */}
                <input
                  type="file"
                  ref={folderDirUploadRef}
                  onChange={handleFolderDirectoryUpload}
                  className="hidden"
                  {...{ webkitdirectory: '', directory: '', multiple: true } as any}
                />
              </div>
            </header>

            {/* Create folder modal */}
            {isCreatingFolder && (
              <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-[#1e293b] border border-[#334155] rounded-2xl shadow-2xl p-6 w-full max-w-sm">
                  <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><IconFolder cls="h-5 w-5 text-blue-400 fill-current" />Buat Folder Baru</h3>
                  <form onSubmit={handleCreateFolder} className="space-y-4">
                    <input
                      type="text" required autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                      placeholder="Nama folder..."
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#0f172a] border border-[#334155] focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none text-sm text-white placeholder:text-slate-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setIsCreatingFolder(false)} className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#0f172a] text-sm font-medium transition">Batal</button>
                      <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition">Buat</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Share modal */}
            {showShareModal && shareItem && (
              <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-[#1e293b] border border-[#334155] rounded-2xl shadow-2xl p-6 w-full max-w-md relative flex flex-col gap-4">
                  <button onClick={() => setShowShareModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>

                  <div>
                    <h3 className="font-semibold text-white mb-2 flex items-center gap-2 text-lg">
                      <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 10.742l4.673-2.337m0 5.186l-4.673-2.337m0 0A3.978 3.978 0 1112 12a3.978 3.978 0 01-3.316-1.576z" /></svg>
                      Bagikan {shareItem.type === 'file' ? 'Berkas' : 'Folder'}
                    </h3>
                    <p className="text-xs text-slate-400 truncate font-medium bg-slate-900/40 px-2 py-1.5 rounded-lg border border-slate-800">{shareItem.name}</p>
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b border-[#334155]">
                    <button
                      onClick={() => setShareTab('email')}
                      className={`flex-1 pb-2 text-sm font-semibold border-b-2 transition-all ${shareTab === 'email' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                    >
                      Bagikan via Email
                    </button>
                    <button
                      onClick={() => setShareTab('link')}
                      className={`flex-1 pb-2 text-sm font-semibold border-b-2 transition-all ${shareTab === 'link' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                    >
                      Dapatkan Link
                    </button>
                  </div>

                  <div>
                    {shareTab === 'email' ? (
                      <form onSubmit={handleShareViaEmail} className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1.5">Alamat Email Penerima</label>
                          <input
                            type="email" required value={shareEmail} onChange={e => setShareEmail(e.target.value)}
                            placeholder="penerima@example.com"
                            className="w-full px-3.5 py-2.5 rounded-lg bg-[#0f172a] border border-[#334155] focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none text-sm text-white placeholder:text-slate-600 transition-all"
                          />
                        </div>
                        <div className="flex justify-end gap-2.5">
                          <button type="submit" disabled={isSharing} className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20 w-full">
                            {isSharing ? 'Membagikan...' : 'Bagikan'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-4">
                        {shareLink ? (
                          <div className="space-y-2">
                            <label className="block text-xs font-medium text-slate-400">Link Berbagi</label>
                            <div className="flex gap-2">
                              <input
                                type="text" readOnly value={shareLink}
                                className="flex-1 px-3 py-2 rounded-lg bg-[#0f172a] border border-[#334155] text-xs text-white outline-none select-all font-mono"
                              />
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(shareLink);
                                  showToast('Link disalin!', 'success');
                                }}
                                className="px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-all shadow-lg"
                              >
                                Salin
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="py-2 text-center flex flex-col items-center">
                            <p className="text-xs text-slate-400 mb-3 font-medium">Buat link publik agar siapa saja dapat mengunduh berkas ini.</p>
                            <button
                              onClick={handleGenerateShareLink}
                              disabled={isSharing}
                              className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20 w-full"
                            >
                              {isSharing ? 'Membuat Link...' : 'Buat Link Berbagi'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Kelola Akses Section */}
                  <div className="pt-4 border-t border-[#334155]">
                    <h4 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
                      <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      Kelola Akses ({existingShares.length})
                    </h4>

                    {isLoadingExistingShares ? (
                      <div className="py-4 text-center">
                        <span className="text-xs text-slate-500 italic animate-pulse">Memuat daftar akses...</span>
                      </div>
                    ) : existingShares.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-2">Belum dibagikan dengan siapa pun.</p>
                    ) : (
                      <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1">
                        {existingShares.map(share => {
                          const isEmail = share.share_type === 'email';
                          return (
                            <div key={share.id} className="flex items-center justify-between bg-[#0f172a]/60 border border-[#334155]/60 rounded-xl p-2.5 text-xs">
                              <div className="min-w-0 flex-1 pr-2">
                                {isEmail ? (
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-slate-200 truncate">{share.shared_to}</span>
                                    <span className="text-[10px] text-slate-500 font-medium">Dibagikan via Email</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-slate-200 truncate font-mono text-[10px]">Tautan Publik</span>
                                    <span className="text-[10px] text-blue-400 truncate hover:underline cursor-pointer" onClick={() => {
                                      const fullLink = `${window.location.origin}/share/${share.token}`;
                                      navigator.clipboard.writeText(fullLink);
                                      showToast('Link disalin!', 'success');
                                    }}>
                                      Klik untuk Salin Link
                                    </span>
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => handleRevokeShare(share.id)}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                                title="Hapus Akses"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-16v1a1 1 0 001 1h3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Selesai / Tutup Button */}
                  <div className="flex justify-end pt-2">
                    <button type="button" onClick={() => setShowShareModal(false)} className="px-4 py-2 rounded-lg bg-[#334155]/40 border border-[#334155] text-slate-300 font-semibold text-xs hover:bg-[#334155]/60 transition-all w-full py-2.5">
                      Tutup
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Home view ── */}
            {activeNav === 'home' && (
              <>
                {/* Quick Access */}
                <section className="mb-7">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Access</h2>
                    <button className="text-xs font-medium text-blue-400 hover:text-blue-300 transition">Lihat semua</button>
                  </div>
                  {recentFiles.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {recentFiles.map(file => {
                        const { label, bg } = getFileExtLabel(file.type, file.name);
                        return (
                          <div
                            key={file.id}
                            onClick={() => { setSelectedFile(file); setDetailTab('detail'); }}
                            className="bg-[#1e293b] border border-[#334155] rounded-xl p-3.5 hover:border-blue-500/50 hover:bg-[#243347] card-hover cursor-pointer flex flex-col justify-between h-[100px]"
                          >
                            <div className="flex items-start gap-2.5">
                              <div className={`${bg} text-white rounded-lg w-8 h-8 flex items-center justify-center text-[9px] font-bold tracking-wider shrink-0`}>{label}</div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <p className="text-sm font-medium text-slate-200 truncate">{file.name}</p>
                                  {file.is_favorited && <svg className="h-3 w-3 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>}
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">{timeAgo(file.created_at)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <div className="h-4 w-4 rounded-full bg-blue-600 flex items-center justify-center text-white text-[8px] font-bold">
                                {currentUser.initials}
                              </div>
                              <span className="text-[10px] text-slate-500">Oleh {file.owner === currentUser.email ? 'Anda' : file.owner}</span>
                            </div>
                          </div>
                        );
                      })}
                      {recentFiles.length < 4 && Array.from({ length: 4 - recentFiles.length }).map((_, i) => (
                        <div key={`ph-${i}`} className="bg-[#1e293b]/50 border border-dashed border-[#334155] rounded-xl p-3 flex items-center justify-center h-[100px]">
                          <p className="text-xs text-slate-600">Belum ada file</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bg-[#1e293b]/50 border border-dashed border-[#334155] rounded-xl p-3 flex items-center justify-center h-[100px]">
                          <p className="text-xs text-slate-600">Belum ada file</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Folders */}
                <section className="mb-7">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Folder</h2>
                    <div className="flex items-center gap-3">
                      <div className="flex bg-[#1e293b] border border-[#334155] p-0.5 rounded-lg">
                        <button onClick={() => setViewMode('list')} className={`p-1 rounded-md transition ${viewMode === 'list' ? 'bg-[#334155] text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}><IconList /></button>
                        <button onClick={() => setViewMode('grid')} className={`p-1 rounded-md transition ${viewMode === 'grid' ? 'bg-[#334155] text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}><IconGrid /></button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {folders.map(folder => {
                      const isDefault = isDefaultFolder(folder.name);
                      const defCfg = DEFAULT_FOLDERS[folder.name];
                      return (
                        <div
                          key={folder.id}
                          onClick={() => { setActiveNav('folders'); setSelectedFolder(folder); }}
                          className="bg-[#1e293b] border border-[#334155] rounded-xl p-3.5 hover:border-blue-500/50 hover:bg-[#243347] card-hover cursor-pointer flex items-center gap-3 relative"
                        >
                          {isDefault ? (
                            <div className={`${defCfg.color} shrink-0`} style={{ width: 32, height: 32 }}>
                              <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                                {folder.name === 'Dokumen' && <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z"/>}
                                {folder.name === 'Gambar' && <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>}
                                {folder.name === 'Video' && <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>}
                                {folder.name === 'Musik' && <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z"/>}
                              </svg>
                            </div>
                          ) : (
                            <IconFolder cls="h-8 w-8 text-blue-400/80 fill-current shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-200 truncate">{folder.name}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{files.filter(f => f.folder_id === folder.id).length} item · {timeAgo(folder.modified_at || folder.created_at)}</p>
                          </div>
                          {isDefault && <span className="absolute top-2 right-2 text-[9px] bg-blue-500/10 text-blue-400 font-medium px-1.5 py-0.5 rounded-md border border-blue-500/20">DEFAULT</span>}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* File Table */}
                <section>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">File</h2>
                  {isLoadingFiles ? (
                    <div className="py-12 flex items-center justify-center gap-3 text-slate-400 bg-[#1e293b] rounded-xl border border-[#334155]">
                      <IconRefresh spin />
                      <span className="text-sm font-medium">Memuat berkas...</span>
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div className="py-16 text-center border border-dashed border-[#334155] rounded-xl bg-[#1e293b]/50">
                      <div className="flex justify-center mb-3 text-slate-600"><IconUpload /></div>
                      <p className="text-base font-semibold text-slate-300">Belum ada berkas</p>
                      <p className="text-sm text-slate-500 mt-1">Unggah berkas pertama Anda menggunakan tombol di atas.</p>
                    </div>
                  ) : (
                    <div className="bg-[#1e293b] rounded-xl border border-[#334155] overflow-hidden overflow-x-auto">
                      <table className="w-full text-left min-w-[650px] md:min-w-0">
                        <thead>
                          <tr className="text-[11px] font-medium text-slate-500 tracking-wider border-b border-[#334155] bg-[#111827]/50">
                            <th className="py-2.5 pt-3 px-4 w-10 shrink-0">
                              <input
                                type="checkbox"
                                checked={homeFiles.length > 0 && homeFiles.every(f => selectedFileIds.includes(f.id))}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const idsToAdd = homeFiles.map(f => f.id);
                                    setSelectedFileIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
                                  } else {
                                    const idsToRemove = homeFiles.map(f => f.id);
                                    setSelectedFileIds(prev => prev.filter(id => !idsToRemove.includes(id)));
                                  }
                                }}
                                className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                              />
                            </th>
                            <th className="pb-2.5 pt-3 px-4">
                              <button className="flex items-center gap-1 hover:text-slate-300 transition">Nama <IconChevronUp /></button>
                            </th>
                            <th className="pb-2.5 pt-3 px-4">Pemilik</th>
                            <th className="pb-2.5 pt-3 px-4">
                              <button className="flex items-center gap-1 hover:text-slate-300 transition">Terakhir diubah <IconChevronDown cls="h-3 w-3" /></button>
                            </th>
                            <th className="pb-2.5 pt-3 px-4">Ukuran</th>
                            <th className="pb-2.5 pt-3 px-4" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e293b] text-sm text-slate-300">
                          {homeFiles.map(file => {
                            const { label, bg } = getFileExtLabel(file.type, file.name);
                            const isSelected = selectedFile?.id === file.id;
                            const isChecked = selectedFileIds.includes(file.id);
                            return (
                              <tr
                                key={file.id}
                                onClick={() => { setSelectedFile(file); setDetailTab('detail'); }}
                                className={`group transition-colors cursor-pointer ${isSelected ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : 'hover:bg-[#243347]'} ${isChecked ? 'bg-blue-500/5' : ''}`}
                              >
                                <td className="py-3 px-4 w-10 shrink-0" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setSelectedFileIds(prev =>
                                        prev.includes(file.id) ? prev.filter(id => id !== file.id) : [...prev, file.id]
                                      );
                                    }}
                                    className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                  />
                                </td>
                                <td className="py-3 px-4 flex items-center gap-2.5">
                                  <div className={`${bg} text-white rounded-md w-7 h-7 flex items-center justify-center text-[9px] font-bold tracking-wider shrink-0`}>{label}</div>
                                  <span className="font-medium text-slate-200 truncate max-w-[200px]">{file.name}</span>
                                  {file.is_favorited && <svg className="h-3 w-3 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>}
                                </td>
                                <td className="py-3 px-4 text-slate-400 text-sm">{file.owner === currentUser.email ? 'Anda' : file.owner}</td>
                                <td className="py-3 px-4 text-slate-400 text-sm">{timeAgo(file.created_at)}</td>
                                <td className="py-3 px-4 text-slate-400 text-sm">{formatBytes(file.size)}</td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={e => { e.stopPropagation(); handleToggleFavorite(file); }}
                                      className={`p-1.5 rounded-lg transition ${file.is_favorited ? 'text-amber-400 hover:bg-amber-500/10' : 'text-slate-500 hover:text-amber-400 hover:bg-amber-500/10'}`}
                                      title={file.is_favorited ? 'Hapus dari favorit' : 'Tambah ke favorit'}
                                    >
                                      <svg className="h-4 w-4" fill={file.is_favorited ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                                    </button>
                                    <a href={`${BACKEND_URL}${file.path}`} download={file.name} target="_blank" rel="noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition" title="Unduh">
                                      <IconDownload />
                                    </a>
                                    <button
                                      onClick={e => { e.stopPropagation(); handleOpenShareModal('file', file.id, file.name); }}
                                      className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition"
                                      title="Bagikan"
                                    >
                                      <IconShare />
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); handleFileDelete(file.id, file.name); }}
                                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition" title="Hapus">
                                      <IconTrash />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* ── Folders page ── */}
            {activeNav === 'folders' && (() => {
              const rootFiles = files.filter(f => !f.folder_id && f.name.toLowerCase().includes(searchQuery.toLowerCase()));
              if (selectedFolder) {
                // ── Folder contents view ──
                const folderFiles = files.filter(f => f.folder_id === selectedFolder.id);
                return (
                  <>
                    {/* Stats row */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center gap-2 bg-[#1e293b] border border-[#334155] rounded-lg px-4 py-2.5">
                        <svg className="h-4 w-4 text-blue-400" fill="currentColor" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <span className="text-sm font-medium text-slate-300">{folderFiles.length} File</span>
                      </div>
                      <div className="flex items-center gap-2 bg-[#1e293b] border border-[#334155] rounded-lg px-4 py-2.5">
                        <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
                        <span className="text-sm font-medium text-slate-300">{formatBytes(folderFiles.reduce((a, f) => a + f.size, 0))}</span>
                      </div>
                    </div>

                    {/* File type restriction banner for default folders */}
                    {isDefaultFolder(selectedFolder.name) && (() => {
                      const cfg = DEFAULT_FOLDERS[selectedFolder.name];
                      const colors: Record<string, string> = {
                        'Dokumen': 'bg-blue-500/10 border-blue-500/30 text-blue-400',
                        'Gambar': 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                        'Video': 'bg-purple-500/10 border-purple-500/30 text-purple-400',
                        'Musik': 'bg-pink-500/10 border-pink-500/30 text-pink-400',
                      };
                      return (
                        <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 mb-4 text-xs font-semibold ${colors[selectedFolder.name] || 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <span>Folder ini hanya menerima: <strong>{cfg.label}</strong></span>
                        </div>
                      );
                    })()}

                    {/* File table inside folder */}
                    {folderFiles.length === 0 ? (
                      <div
                        className="py-20 text-center border border-dashed border-[#334155] rounded-xl bg-[#1e293b]/50 cursor-pointer hover:border-blue-500/50 hover:bg-[#1e293b] transition group"
                        onClick={() => {
                          if (fileInputRef.current) {
                            if (activeNav === 'folders' && selectedFolder) {
                              fileInputRef.current.accept = getFolderAccept(selectedFolder.name);
                            } else {
                              fileInputRef.current.accept = '';
                            }
                            fileInputRef.current.click();
                          }
                        }}
                      >
                        <div className="flex justify-center mb-3 text-slate-600 group-hover:text-blue-400 transition">
                          <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        </div>
                        <p className="text-sm font-medium text-slate-400 group-hover:text-slate-200 transition">Folder masih kosong</p>
                        <p className="text-xs text-slate-600 mt-1">Klik untuk mengunggah berkas, atau seret berkas & folder ke sini.</p>
                      </div>
                    ) : (
                      <div className="bg-[#1e293b] rounded-xl border border-[#334155] overflow-hidden overflow-x-auto">
                        <table className="w-full text-left min-w-[650px] md:min-w-0">
                          <thead>
                            <tr className="text-[11px] font-medium text-slate-500 tracking-wider border-b border-[#334155] bg-[#111827]/50">
                              <th className="py-2.5 pt-3 px-4 w-10 shrink-0">
                                <input
                                  type="checkbox"
                                  checked={folderFiles.length > 0 && folderFiles.every(f => selectedFileIds.includes(f.id))}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      const idsToAdd = folderFiles.map(f => f.id);
                                      setSelectedFileIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
                                    } else {
                                      const idsToRemove = folderFiles.map(f => f.id);
                                      setSelectedFileIds(prev => prev.filter(id => !idsToRemove.includes(id)));
                                    }
                                  }}
                                  className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                />
                              </th>
                              <th className="pb-2.5 pt-3 px-4">Nama</th>
                              <th className="pb-2.5 pt-3 px-4">Pemilik</th>
                              <th className="pb-2.5 pt-3 px-4">Diunggah</th>
                              <th className="pb-2.5 pt-3 px-4">Ukuran</th>
                              <th className="pb-2.5 pt-3 px-4" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1e293b] text-sm text-slate-300">
                            {folderFiles.map(file => {
                              const { label, bg } = getFileExtLabel(file.type, file.name);
                              const isSelected = selectedFile?.id === file.id;
                              const isChecked = selectedFileIds.includes(file.id);
                              return (
                                <tr
                                  key={file.id}
                                  onClick={() => { setSelectedFile(file); setDetailTab('detail'); }}
                                  className={`group transition-colors cursor-pointer ${isSelected ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : 'hover:bg-[#243347]'} ${isChecked ? 'bg-blue-500/5' : ''}`}
                                >
                                  <td className="py-3 px-4 w-10 shrink-0" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        setSelectedFileIds(prev =>
                                          prev.includes(file.id) ? prev.filter(id => id !== file.id) : [...prev, file.id]
                                        );
                                      }}
                                      className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-3 px-4 flex items-center gap-2.5">
                                    <div className={`${bg} text-white rounded-md w-7 h-7 flex items-center justify-center text-[9px] font-bold tracking-wider shrink-0`}>{label}</div>
                                    <span className="font-medium text-slate-200 truncate max-w-[200px]">{file.name}</span>
                                    {file.is_favorited && <svg className="h-3 w-3 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>}
                                  </td>
                                  <td className="py-3 px-4 text-slate-400">{file.owner === currentUser?.email ? 'Anda' : file.owner}</td>
                                  <td className="py-3 px-4 text-slate-400">{timeAgo(file.created_at)}</td>
                                  <td className="py-3 px-4 text-slate-400">{formatBytes(file.size)}</td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={e => { e.stopPropagation(); handleToggleFavorite(file); }}
                                        className={`p-1.5 rounded-lg transition ${file.is_favorited ? 'text-amber-400 hover:bg-amber-500/10' : 'text-slate-500 hover:text-amber-400 hover:bg-amber-500/10'}`}
                                        title={file.is_favorited ? 'Hapus dari favorit' : 'Tambah ke favorit'}
                                      >
                                        <svg className="h-4 w-4" fill={file.is_favorited ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                                      </button>
                                      <a href={`${BACKEND_URL}${file.path}`} download={file.name} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition" title="Unduh"><IconDownload /></a>
                                      <button
                                        onClick={e => { e.stopPropagation(); handleOpenShareModal('file', file.id, file.name); }}
                                        className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition"
                                        title="Bagikan"
                                      >
                                        <IconShare />
                                      </button>
                                      <button onClick={e => { e.stopPropagation(); handleFileDelete(file.id, file.name); }} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition" title="Hapus"><IconTrash /></button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              }

              // ── Folder grid view ──
              const sortedFolders = [...folders].sort((a, b) => {
                // Default folders always pinned at the top
                const aIsDefault = isDefaultFolder(a.name) ? 0 : 1;
                const bIsDefault = isDefaultFolder(b.name) ? 0 : 1;
                if (aIsDefault !== bIsDefault) return aIsDefault - bIsDefault;

                // Within each group, apply user-chosen sort
                if (folderSortBy === 'name') {
                  return folderSortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
                }
                const dateA = new Date(a.modified_at || a.created_at).getTime();
                const dateB = new Date(b.modified_at || b.created_at).getTime();
                return folderSortAsc ? dateA - dateB : dateB - dateA;
              });

              return (
                <>
                  {/* Toolbar */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1.5 text-sm text-slate-500 font-medium">
                      <span>{folders.length} folder</span>
                      <span>·</span>
                      <span>{files.length} file total</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => { if (folderSortBy === 'name') setFolderSortAsc(v => !v); else { setFolderSortBy('name'); setFolderSortAsc(true); } }}
                          className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition ${folderSortBy === 'name' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-[#1e293b]'}`}
                        >
                          Nama {folderSortBy === 'name' && (folderSortAsc ? '↑' : '↓')}
                        </button>
                        <button
                          onClick={() => { if (folderSortBy === 'modified') setFolderSortAsc(v => !v); else { setFolderSortBy('modified'); setFolderSortAsc(false); } }}
                          className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition ${folderSortBy === 'modified' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-[#1e293b]'}`}
                        >
                          Diubah {folderSortBy === 'modified' && (folderSortAsc ? '↑' : '↓')}
                        </button>
                      </div>
                      <div className="flex bg-[#1e293b] border border-[#334155] p-0.5 rounded-lg">
                        <button onClick={() => setViewMode('list')} className={`p-1 rounded-md transition ${viewMode === 'list' ? 'bg-[#334155] text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}><IconList /></button>
                        <button onClick={() => setViewMode('grid')} className={`p-1 rounded-md transition ${viewMode === 'grid' ? 'bg-[#334155] text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}><IconGrid /></button>
                      </div>
                    </div>
                  </div>

                  {folders.length === 0 ? (
                    <div
                      className="py-20 text-center border border-dashed border-[#334155] rounded-xl bg-[#1e293b]/50 cursor-pointer hover:border-blue-500/50 hover:bg-[#1e293b] transition group"
                      onClick={() => setIsCreatingFolder(true)}
                    >
                      <div className="flex justify-center mb-3">
                        <svg className="h-12 w-12 text-slate-600 group-hover:text-blue-400 transition" fill="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                      </div>
                      <p className="text-sm font-medium text-slate-400 group-hover:text-slate-200 transition">Belum ada folder</p>
                      <p className="text-xs text-slate-600 mt-1">Klik untuk membuat folder pertama Anda</p>
                    </div>
                  ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {sortedFolders.map(folder => {
                        const count = files.filter(f => f.folder_id === folder.id).length;
                        const isDefault = isDefaultFolder(folder.name);
                        const defCfg = DEFAULT_FOLDERS[folder.name];
                        return (
                          <div
                            key={folder.id}
                            onClick={() => setSelectedFolder(folder)}
                            className="group bg-[#1e293b] border border-[#334155] rounded-xl p-4 hover:border-blue-500/50 hover:bg-[#243347] card-hover cursor-pointer relative"
                          >
                            {!isDefault && (
                              <>
                                <button
                                  onClick={e => { e.stopPropagation(); handleOpenShareModal('folder', folder.id, folder.name); }}
                                  className="absolute top-2.5 right-9 p-1 rounded-md text-slate-600 hover:text-blue-400 hover:bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                  title="Bagikan folder"
                                >
                                  <IconShare />
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.id, folder.name); }}
                                  className="absolute top-2.5 right-2.5 p-1 rounded-md text-slate-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                  title="Hapus folder"
                                >
                                  <IconTrash />
                                </button>
                              </>
                            )}
                            {isDefault && (
                              <span className="absolute top-2 right-2 text-[9px] bg-blue-500/10 text-blue-400 font-medium px-1.5 py-0.5 rounded-md border border-blue-500/20">DEFAULT</span>
                            )}
                            <div className="flex items-center gap-3 mb-3">
                              {isDefault ? (
                                <svg className={`h-10 w-10 shrink-0 ${defCfg.color}`} fill="currentColor" viewBox="0 0 24 24">
                                  {folder.name === 'Dokumen' && <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z"/>}
                                  {folder.name === 'Gambar' && <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>}
                                  {folder.name === 'Video' && <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>}
                                  {folder.name === 'Musik' && <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z"/>}
                                </svg>
                              ) : (
                                <svg className="h-10 w-10 text-blue-400/80 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                              )}
                            </div>
                            <p className="text-sm font-medium text-slate-200 truncate pr-6">{folder.name}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {count} item · {timeAgo(folder.modified_at || folder.created_at)}
                            </p>
                            {isDefault && <p className="text-[10px] text-slate-600 mt-1 truncate">{defCfg.label}</p>}
                          </div>
                        );
                      })}
                      {/* Add new folder card */}
                      <div
                        onClick={() => setIsCreatingFolder(true)}
                        className="bg-[#1e293b]/50 border border-dashed border-[#334155] rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:border-blue-500/50 hover:bg-[#1e293b] transition cursor-pointer min-h-[100px]"
                      >
                        <div className="text-slate-500"><IconPlus /></div>
                        <span className="text-xs font-medium text-slate-500">Buat folder baru</span>
                      </div>
                    </div>
                  ) : (
                    // List view
                    <div className="bg-[#1e293b] rounded-xl border border-[#334155] overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[11px] font-medium text-slate-500 tracking-wider border-b border-[#334155] bg-[#111827]/50">
                            <th className="pb-2.5 pt-3 px-4">Nama</th>
                            <th className="pb-2.5 pt-3 px-4">Jumlah File</th>
                            <th className="pb-2.5 pt-3 px-4">Terakhir Diubah</th>
                            <th className="pb-2.5 pt-3 px-4">Pemilik</th>
                            <th className="pb-2.5 pt-3 px-4" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e293b] text-sm">
                          {sortedFolders.map(folder => {
                            const count = files.filter(f => f.folder_id === folder.id).length;
                            const isDefault = isDefaultFolder(folder.name);
                            const defCfg = DEFAULT_FOLDERS[folder.name];
                            return (
                              <tr key={folder.id} onClick={() => setSelectedFolder(folder)} className="group hover:bg-[#243347] cursor-pointer transition-colors">
                                <td className="py-3 px-4 flex items-center gap-2.5">
                                  {isDefault ? (
                                    <svg className={`h-5 w-5 shrink-0 ${defCfg.color}`} fill="currentColor" viewBox="0 0 24 24">
                                      {folder.name === 'Dokumen' && <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z"/>}
                                      {folder.name === 'Gambar' && <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>}
                                      {folder.name === 'Video' && <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>}
                                      {folder.name === 'Musik' && <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z"/>}
                                    </svg>
                                  ) : (
                                    <svg className="h-5 w-5 text-blue-400/80 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                  )}
                                  <span className="font-medium text-slate-200">{folder.name}</span>
                                  {isDefault && <span className="text-[9px] bg-blue-500/10 text-blue-400 font-medium px-1.5 py-0.5 rounded-md border border-blue-500/20 ml-1">DEFAULT</span>}
                                </td>
                                <td className="py-3 px-4 text-slate-400">{count} file</td>
                                <td className="py-3 px-4 text-slate-400">{timeAgo(folder.modified_at || folder.created_at)}</td>
                                <td className="py-3 px-4 text-slate-400">{folder.owner === currentUser?.email ? 'Anda' : folder.owner === 'system' ? 'Sistem' : folder.owner}</td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!isDefault && (
                                      <>
                                        <button
                                          onClick={e => { e.stopPropagation(); handleOpenShareModal('folder', folder.id, folder.name); }}
                                          className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition"
                                          title="Bagikan"
                                        >
                                          <IconShare />
                                        </button>
                                        <button onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.id, folder.name); }} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"><IconTrash /></button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Berkas di Root (di luar folder) */}
                  <div className="mt-8">
                    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Berkas di My Drive</h2>
                    {rootFiles.length === 0 ? (
                      <div className="py-12 text-center border border-dashed border-[#334155] rounded-xl bg-[#1e293b]/20">
                        <p className="text-xs text-slate-500">Belum ada berkas di luar folder</p>
                      </div>
                    ) : (
                      <div className="bg-[#1e293b] rounded-xl border border-[#334155] overflow-hidden overflow-x-auto">
                        <table className="w-full text-left min-w-[650px] md:min-w-0">
                          <thead>
                            <tr className="text-[11px] font-medium text-slate-500 tracking-wider border-b border-[#334155] bg-[#111827]/50">
                              <th className="py-2.5 pt-3 px-4 w-10 shrink-0">
                                <input
                                  type="checkbox"
                                  checked={rootFiles.length > 0 && rootFiles.every(f => selectedFileIds.includes(f.id))}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      const idsToAdd = rootFiles.map(f => f.id);
                                      setSelectedFileIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
                                    } else {
                                      const idsToRemove = rootFiles.map(f => f.id);
                                      setSelectedFileIds(prev => prev.filter(id => !idsToRemove.includes(id)));
                                    }
                                  }}
                                  className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                />
                              </th>
                              <th className="pb-2.5 pt-3 px-4">Nama</th>
                              <th className="pb-2.5 pt-3 px-4">Pemilik</th>
                              <th className="pb-2.5 pt-3 px-4">Diunggah</th>
                              <th className="pb-2.5 pt-3 px-4">Ukuran</th>
                              <th className="pb-2.5 pt-3 px-4" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1e293b] text-sm text-slate-300">
                            {rootFiles.map(file => {
                              const { label, bg } = getFileExtLabel(file.type, file.name);
                              const isSelected = selectedFile?.id === file.id;
                              const isChecked = selectedFileIds.includes(file.id);
                              return (
                                <tr
                                  key={file.id}
                                  onClick={() => { setSelectedFile(file); setDetailTab('detail'); }}
                                  className={`group transition-colors cursor-pointer ${isSelected ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : 'hover:bg-[#243347]'} ${isChecked ? 'bg-blue-500/5' : ''}`}
                                >
                                  <td className="py-3 px-4 w-10 shrink-0" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        setSelectedFileIds(prev =>
                                          prev.includes(file.id) ? prev.filter(id => id !== file.id) : [...prev, file.id]
                                        );
                                      }}
                                      className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-3 px-4 flex items-center gap-2.5">
                                    <div className={`${bg} text-white rounded-md w-7 h-7 flex items-center justify-center text-[9px] font-bold tracking-wider shrink-0`}>{label}</div>
                                    <span className="font-medium text-slate-200 truncate max-w-[200px]">{file.name}</span>
                                    {file.is_favorited && <svg className="h-3 w-3 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>}
                                  </td>
                                  <td className="py-3 px-4 text-slate-400">{file.owner === currentUser?.email ? 'Anda' : file.owner}</td>
                                  <td className="py-3 px-4 text-slate-400">{timeAgo(file.created_at)}</td>
                                  <td className="py-3 px-4 text-slate-400">{formatBytes(file.size)}</td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={e => { e.stopPropagation(); handleToggleFavorite(file); }}
                                        className={`p-1.5 rounded-lg transition ${file.is_favorited ? 'text-amber-400 hover:bg-amber-500/10' : 'text-slate-500 hover:text-amber-400 hover:bg-amber-500/10'}`}
                                        title={file.is_favorited ? 'Hapus dari favorit' : 'Tambah ke favorit'}
                                      >
                                        <svg className="h-4 w-4" fill={file.is_favorited ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                                      </button>
                                      <a href={`${BACKEND_URL}${file.path}`} download={file.name} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition" title="Unduh"><IconDownload /></a>
                                      <button
                                        onClick={e => { e.stopPropagation(); handleOpenShareModal('file', file.id, file.name); }}
                                        className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition"
                                        title="Bagikan"
                                      >
                                        <IconShare />
                                      </button>
                                      <button onClick={e => { e.stopPropagation(); handleFileDelete(file.id, file.name); }} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition" title="Hapus"><IconTrash /></button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {/* ── Terbaru ── */}
            {activeNav === 'recent' && (() => {
              const recentAll = [...files].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
              return (
                <>
                  <p className="text-sm text-slate-500 font-medium mb-4">{recentAll.length} file — diurutkan dari terbaru</p>
                  {recentAll.length === 0 ? (
                    <div className="py-20 text-center border border-dashed border-[#334155] rounded-xl bg-[#1e293b]/50">
                      <svg className="h-12 w-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <p className="text-sm font-medium text-slate-400">Belum ada file</p>
                      <p className="text-xs text-slate-600 mt-1">Unggah file dari halaman Beranda.</p>
                    </div>
                  ) : (
                    <div className="bg-[#1e293b] rounded-xl border border-[#334155] overflow-hidden overflow-x-auto">
                      <table className="w-full text-left min-w-[650px] md:min-w-0">
                        <thead>
                          <tr className="text-[11px] font-medium text-slate-500 tracking-wider border-b border-[#334155] bg-[#111827]/50">
                            <th className="py-2.5 pt-3 px-4 w-10 shrink-0">
                              <input
                                type="checkbox"
                                checked={recentAll.length > 0 && recentAll.every(f => selectedFileIds.includes(f.id))}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const idsToAdd = recentAll.map(f => f.id);
                                    setSelectedFileIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
                                  } else {
                                    const idsToRemove = recentAll.map(f => f.id);
                                    setSelectedFileIds(prev => prev.filter(id => !idsToRemove.includes(id)));
                                  }
                                }}
                                className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                              />
                            </th>
                            <th className="pb-2.5 pt-3 px-4">Nama</th>
                            <th className="pb-2.5 pt-3 px-4">Folder</th>
                            <th className="pb-2.5 pt-3 px-4">Diunggah</th>
                            <th className="pb-2.5 pt-3 px-4">Ukuran</th>
                            <th className="pb-2.5 pt-3 px-4" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e293b] text-sm text-slate-300">
                          {recentAll.map(file => {
                            const { label, bg } = getFileExtLabel(file.type, file.name);
                            const folder = folders.find(f => f.id === file.folder_id);
                            const isSelected = selectedFile?.id === file.id;
                            const isChecked = selectedFileIds.includes(file.id);
                            return (
                              <tr
                                key={file.id}
                                onClick={() => { setSelectedFile(file); setDetailTab('detail'); }}
                                className={`group transition-colors cursor-pointer ${isSelected ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : 'hover:bg-[#243347]'} ${isChecked ? 'bg-blue-500/5' : ''}`}
                              >
                                <td className="py-3 px-4 w-10 shrink-0" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setSelectedFileIds(prev =>
                                        prev.includes(file.id) ? prev.filter(id => id !== file.id) : [...prev, file.id]
                                      );
                                    }}
                                    className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                  />
                                </td>
                                <td className="py-3 px-4 flex items-center gap-2.5">
                                  <div className={`${bg} text-white rounded-md w-7 h-7 flex items-center justify-center text-[9px] font-bold tracking-wider shrink-0`}>{label}</div>
                                  <span className="font-medium text-slate-200 truncate max-w-[180px]">{file.name}</span>
                                  {file.is_favorited && <svg className="h-3 w-3 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>}
                                </td>
                                <td className="py-3 px-4">
                                  {folder ? (
                                    <button onClick={e => { e.stopPropagation(); setActiveNav('folders'); setSelectedFolder(folder); }} className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium text-sm transition">
                                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                      {folder.name}
                                    </button>
                                  ) : <span className="text-slate-600 text-sm">Root</span>}
                                </td>
                                <td className="py-3 px-4 text-slate-400">{timeAgo(file.created_at)}</td>
                                <td className="py-3 px-4 text-slate-400">{formatBytes(file.size)}</td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={e => { e.stopPropagation(); handleToggleFavorite(file); }}
                                      className={`p-1.5 rounded-lg transition ${file.is_favorited ? 'text-amber-400 hover:bg-amber-500/10' : 'text-slate-500 hover:text-amber-400 hover:bg-amber-500/10'}`}
                                      title={file.is_favorited ? 'Hapus dari favorit' : 'Tambah ke favorit'}
                                    >
                                      <svg className="h-4 w-4" fill={file.is_favorited ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                                    </button>
                                    <a href={`${BACKEND_URL}${file.path}`} download={file.name} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition" title="Unduh"><IconDownload /></a>
                                    <button
                                      onClick={e => { e.stopPropagation(); handleOpenShareModal('file', file.id, file.name); }}
                                      className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition"
                                      title="Bagikan"
                                    >
                                      <IconShare />
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); handleFileDelete(file.id, file.name); }} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition" title="Hapus"><IconTrash /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              );
            })()}

            {/* ── Dibagikan ── */}
            {activeNav === 'shared' && (() => {
              if (isLoadingShared) {
                return (
                  <div className="py-12 flex items-center justify-center gap-3 text-slate-400 bg-[#1e293b] rounded-xl border border-[#334155]">
                    <IconRefresh spin />
                    <span className="text-sm font-medium">Memuat berkas dibagikan...</span>
                  </div>
                );
              }

              if (selectedSharedFolder) {
                const folderFiles = selectedSharedFolder.files || [];
                return (
                  <>
                    <div className="flex items-center gap-2 mb-6">
                      <button
                        onClick={() => setSelectedSharedFolder(null)}
                        className="text-blue-400 hover:text-blue-300 text-sm font-medium transition"
                      >
                        Dibagikan
                      </button>
                      <span className="text-slate-600">/</span>
                      <h2 className="text-lg font-bold text-white">{selectedSharedFolder.folder.name}</h2>
                    </div>

                    {folderFiles.length === 0 ? (
                      <div className="py-16 text-center border border-dashed border-[#334155] rounded-xl bg-[#1e293b]/50">
                        <p className="text-sm font-medium text-slate-400">Folder kosong</p>
                      </div>
                    ) : (
                      <div className="bg-[#1e293b] rounded-xl border border-[#334155] overflow-hidden overflow-x-auto">
                        <table className="w-full text-left min-w-[650px] md:min-w-0">
                          <thead>
                            <tr className="text-[11px] font-medium text-slate-500 tracking-wider border-b border-[#334155] bg-[#111827]/50">
                              <th className="pb-2.5 pt-3 px-4">Nama</th>
                              <th className="pb-2.5 pt-3 px-4">Diunggah</th>
                              <th className="pb-2.5 pt-3 px-4">Ukuran</th>
                              <th className="pb-2.5 pt-3 px-4" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1e293b] text-sm text-slate-300">
                            {folderFiles.map((file: any) => {
                              const { label, bg } = getFileExtLabel(file.type, file.name);
                              return (
                                <tr key={file.id} className="hover:bg-[#243347] transition-colors">
                                  <td className="py-3 px-4 flex items-center gap-2.5">
                                    <div className={`${bg} text-white rounded-md w-7 h-7 flex items-center justify-center text-[9px] font-bold tracking-wider shrink-0`}>{label}</div>
                                    <span className="font-medium text-slate-200 truncate max-w-[200px]">{file.name}</span>
                                  </td>
                                  <td className="py-3 px-4 text-slate-400">{timeAgo(file.created_at)}</td>
                                  <td className="py-3 px-4 text-slate-400">{formatBytes(file.size)}</td>
                                  <td className="py-3 px-4 text-right">
                                    <a
                                      href={`${BACKEND_URL}${file.path}`}
                                      download={file.name}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition inline-block"
                                      title="Unduh"
                                    >
                                      <IconDownload />
                                    </a>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              }

              if (sharedItems.length === 0) {
                return (
                  <div className="py-20 text-center border border-dashed border-[#334155] rounded-xl bg-[#1e293b]/50">
                    <svg className="h-12 w-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    <p className="text-sm font-medium text-slate-400">Belum ada file dibagikan</p>
                    <p className="text-xs text-slate-600 mt-1">File atau folder yang dibagikan dengan Anda akan muncul di sini.</p>
                  </div>
                );
              }

              return (
                <div className="bg-[#1e293b] rounded-xl border border-[#334155] overflow-hidden overflow-x-auto">
                  <table className="w-full text-left min-w-[650px] md:min-w-0">
                    <thead>
                      <tr className="text-[11px] font-medium text-slate-500 tracking-wider border-b border-[#334155] bg-[#111827]/50">
                        <th className="pb-2.5 pt-3 px-4">Nama</th>
                        <th className="pb-2.5 pt-3 px-4">Dibagikan Oleh</th>
                        <th className="pb-2.5 pt-3 px-4">Tanggal Berbagi</th>
                        <th className="pb-2.5 pt-3 px-4">Ukuran</th>
                        <th className="pb-2.5 pt-3 px-4" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e293b] text-sm text-slate-300">
                      {sharedItems.map((item: any) => {
                        const isFolder = item.type === 'folder';
                        const name = isFolder ? item.folder.name : item.file.name;
                        const size = isFolder ? '-' : formatBytes(item.file.size);
                        const { label, bg } = isFolder ? { label: 'DIR', bg: 'bg-blue-600' } : getFileExtLabel(item.file.type, name);

                        return (
                          <tr
                            key={item.share_id}
                            onClick={() => {
                              if (isFolder) {
                                setSelectedSharedFolder(item);
                              } else {
                                setSelectedFile(item.file);
                                setDetailTab('detail');
                              }
                            }}
                            className="group hover:bg-[#243347] cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-4 flex items-center gap-2.5">
                              {isFolder ? (
                                <IconFolder cls="h-7 w-7 text-blue-400/80 fill-current shrink-0" />
                              ) : (
                                <div className={`${bg} text-white rounded-md w-7 h-7 flex items-center justify-center text-[9px] font-bold tracking-wider shrink-0`}>{label}</div>
                              )}
                              <span className="font-medium text-slate-200 truncate max-w-[200px]">{name}</span>
                            </td>
                            <td className="py-3 px-4 text-slate-400">{item.shared_by}</td>
                            <td className="py-3 px-4 text-slate-400">{timeAgo(item.created_at)}</td>
                            <td className="py-3 px-4 text-slate-400">{size}</td>
                            <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                              {isFolder ? (
                                <button
                                  onClick={() => setSelectedSharedFolder(item)}
                                  className="p-1.5 text-blue-400 hover:text-blue-300 font-semibold text-xs animate-pulse"
                                >
                                  Buka
                                </button>
                              ) : (
                                <a
                                  href={`${BACKEND_URL}${item.file.path}`}
                                  download={name}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition inline-block"
                                  title="Unduh"
                                >
                                  <IconDownload />
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* ── Favorit ── */}
            {activeNav === 'starred' && (() => {
              const favFiles = files.filter(f => f.is_favorited);
              return (
                <>
                  <p className="text-sm text-slate-500 font-medium mb-4">{favFiles.length} file favorit</p>
                  {favFiles.length === 0 ? (
                    <div className="py-20 text-center border border-dashed border-[#334155] rounded-2xl bg-[#1e293b]/20 backdrop-blur-sm max-w-lg mx-auto mt-8 p-6 flex flex-col items-center">
                      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 shadow-lg shadow-amber-500/5 animate-pulse">
                        <svg className="h-8 w-8 text-amber-400 fill-current" viewBox="0 0 24 24">
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                      </div>
                      <p className="text-base font-bold text-slate-200">Belum Ada Berkas Favorit</p>
                      <p className="text-xs text-slate-500 mt-2 text-center max-w-xs leading-relaxed">
                        Tandai berkas penting Anda dengan menekan ikon bintang untuk mengaksesnya dengan cepat di sini.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-[#1e293b] rounded-xl border border-[#334155] overflow-hidden overflow-x-auto">
                      <table className="w-full text-left min-w-[650px] md:min-w-0">
                        <thead>
                          <tr className="text-[11px] font-medium text-slate-500 tracking-wider border-b border-[#334155] bg-[#111827]/50">
                            <th className="py-2.5 pt-3 px-4 w-10 shrink-0">
                              <input
                                type="checkbox"
                                checked={favFiles.length > 0 && favFiles.every(f => selectedFileIds.includes(f.id))}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const idsToAdd = favFiles.map(f => f.id);
                                    setSelectedFileIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
                                  } else {
                                    const idsToRemove = favFiles.map(f => f.id);
                                    setSelectedFileIds(prev => prev.filter(id => !idsToRemove.includes(id)));
                                  }
                                }}
                                className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                              />
                            </th>
                            <th className="pb-2.5 pt-3 px-4">Nama</th>
                            <th className="pb-2.5 pt-3 px-4">Folder</th>
                            <th className="pb-2.5 pt-3 px-4">Diunggah</th>
                            <th className="pb-2.5 pt-3 px-4">Ukuran</th>
                            <th className="pb-2.5 pt-3 px-4" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e293b] text-sm text-slate-300">
                          {favFiles.map(file => {
                            const { label, bg } = getFileExtLabel(file.type, file.name);
                            const folder = folders.find(f => f.id === file.folder_id);
                            const isSelected = selectedFile?.id === file.id;
                            const isChecked = selectedFileIds.includes(file.id);
                            return (
                              <tr
                                key={file.id}
                                onClick={() => { setSelectedFile(file); setDetailTab('detail'); }}
                                className={`group transition-colors cursor-pointer ${isSelected ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : 'hover:bg-[#243347]'} ${isChecked ? 'bg-blue-500/5' : ''}`}
                              >
                                <td className="py-3 px-4 w-10 shrink-0" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setSelectedFileIds(prev =>
                                        prev.includes(file.id) ? prev.filter(id => id !== file.id) : [...prev, file.id]
                                      );
                                    }}
                                    className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                  />
                                </td>
                                <td className="py-3 px-4 flex items-center gap-2.5">
                                  <div className={`${bg} text-white rounded-md w-7 h-7 flex items-center justify-center text-[9px] font-bold tracking-wider shrink-0`}>{label}</div>
                                  <span className="font-medium text-slate-200 truncate max-w-[200px]">{file.name}</span>
                                  <svg className="h-3.5 w-3.5 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                                </td>
                                <td className="py-3 px-4">
                                  {folder ? (
                                    <button onClick={e => { e.stopPropagation(); setActiveNav('folders'); setSelectedFolder(folder); }} className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium text-sm transition">
                                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                      {folder.name}
                                    </button>
                                  ) : <span className="text-slate-600 text-sm">Root</span>}
                                </td>
                                <td className="py-3 px-4 text-slate-400">{timeAgo(file.created_at)}</td>
                                <td className="py-3 px-4 text-slate-400">{formatBytes(file.size)}</td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={e => { e.stopPropagation(); handleToggleFavorite(file); }}
                                      className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg transition"
                                      title="Hapus dari favorit"
                                    >
                                      <svg className="h-4 w-4" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                                    </button>
                                    <a href={`${BACKEND_URL}${file.path}`} download={file.name} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition" title="Unduh"><IconDownload /></a>
                                    <button
                                      onClick={e => { e.stopPropagation(); handleOpenShareModal('file', file.id, file.name); }}
                                      className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition"
                                      title="Bagikan"
                                    >
                                      <IconShare />
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); handleFileDelete(file.id, file.name); }} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition" title="Hapus"><IconTrash /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              );
            })()}

            {/* ── Sampah ── */}
            {activeNav === 'trash' && (() => {
              function daysLeft(deletedAt: string): number {
                const expiry = new Date(new Date(deletedAt).getTime() + 7 * 24 * 60 * 60 * 1000);
                const diff = expiry.getTime() - Date.now();
                return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
              }

              // Kelompokkan file berdasarkan folder
              // Pakai folder_name sebagai key grouping (snapshot, tetap ada walau folder dihapus)
              const filesWithFolder = trashFiles.filter(f => f.folder_name || f.folder_id);
              const filesWithoutFolder = trashFiles.filter(f => !f.folder_name && !f.folder_id);

              // Buat map groupKey → { folderName, files[] }
              // groupKey = folder_id jika ada, fallback ke folder_name
              const folderGroups: Map<string, { folderName: string; files: FileItem[] }> = new Map();
              filesWithFolder.forEach(file => {
                const groupKey = file.folder_id ?? `name:${file.folder_name}`;
                const folderName = file.folder_name
                  ?? folders.find(f => f.id === file.folder_id)?.name
                  ?? `Folder (${String(file.folder_id).slice(0, 6)}...)`;
                if (!folderGroups.has(groupKey)) {
                  folderGroups.set(groupKey, { folderName, files: [] });
                }
                folderGroups.get(groupKey)!.files.push(file);
              });

              // TrashFolderGroup component (inline)
              const TrashFolderGroup = ({ folderName, groupFiles }: { folderId: string; folderName: string; groupFiles: FileItem[] }) => {
                const [expanded, setExpanded] = React.useState(false);
                const allChecked = groupFiles.every(f => selectedFileIds.includes(f.id));
                const earliestDelete = groupFiles.reduce((min, f) => {
                  if (!f.deleted_at) return min;
                  return !min || f.deleted_at < min ? f.deleted_at : min;
                }, '' as string);
                const remaining = earliestDelete ? daysLeft(earliestDelete) : 0;
                const isExpiringSoon = remaining <= 1;
                const totalSize = groupFiles.reduce((s, f) => s + f.size, 0);

                return (
                  <div className="border border-[#334155] rounded-xl overflow-hidden mb-3">
                    {/* Folder header row */}
                    <div
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#243347] transition-colors ${expanded ? 'bg-[#1a2744]/60 border-b border-[#334155]' : 'bg-[#1e293b]'}`}
                      onClick={() => setExpanded(v => !v)}
                    >
                      {/* Checkbox */}
                      <div onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={() => {
                            const ids = groupFiles.map(f => f.id);
                            if (allChecked) {
                              setSelectedFileIds(prev => prev.filter(id => !ids.includes(id)));
                            } else {
                              setSelectedFileIds(prev => Array.from(new Set([...prev, ...ids])));
                            }
                          }}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                        />
                      </div>

                      {/* Folder icon */}
                      <svg className="h-5 w-5 text-blue-400/70 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-300 truncate">{folderName}</p>
                        <p className="text-[11px] text-slate-500">{groupFiles.length} file · {formatBytes(totalSize)}</p>
                      </div>

                      {/* Sisa waktu */}
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${isExpiringSoon ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                        <IconClock />
                        {remaining === 0 ? 'Kedaluwarsa' : `${remaining} hari`}
                      </span>

                      {/* Aksi folder */}
                      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            Promise.all(groupFiles.map(f => axios.post(`${BACKEND_URL}/api/files/${f.id}/restore`)))
                              .then(() => { showToast(`${groupFiles.length} file dipulihkan.`, 'success'); fetchFiles(); fetchTrash(); })
                              .catch(() => showToast('Gagal memulihkan.', 'error'));
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition border border-emerald-500/20"
                        >
                          <IconRestore />Pulihkan semua
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Hapus permanen ${groupFiles.length} file dari folder "${folderName}"?`)) {
                              Promise.all(groupFiles.map(f => axios.delete(`${BACKEND_URL}/api/files/${f.id}/permanent`)))
                                .then(() => { showToast(`${groupFiles.length} file dihapus permanen.`, 'success'); fetchTrash(); })
                                .catch(() => showToast('Gagal menghapus.', 'error'));
                            }
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition border border-red-500/20"
                        >
                          <IconTrash />Hapus semua
                        </button>
                      </div>

                      {/* Expand chevron */}
                      <svg className={`h-4 w-4 text-slate-500 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                      </svg>
                    </div>

                    {/* Expanded file list */}
                    {expanded && (
                      <div className="divide-y divide-[#334155]/50 bg-[#111827]/40">
                        {groupFiles.map(file => {
                          const { label, bg } = getFileExtLabel(file.type, file.name);
                          const rem = file.deleted_at ? daysLeft(file.deleted_at) : 0;
                          const expiring = rem <= 1;
                          const isChecked = selectedFileIds.includes(file.id);
                          return (
                            <div key={file.id} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-[#243347] transition-colors ${isChecked ? 'bg-blue-500/5' : ''}`}>
                              <div onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => setSelectedFileIds(prev => prev.includes(file.id) ? prev.filter(id => id !== file.id) : [...prev, file.id])}
                                  className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                />
                              </div>
                              <div className={`${bg} text-white rounded-md w-6 h-6 flex items-center justify-center text-[8px] font-bold shrink-0 opacity-50`}>{label}</div>
                              <span className="flex-1 text-xs font-medium text-slate-400 truncate">{file.name}</span>
                              <span className="text-[10px] text-slate-500 shrink-0">{formatBytes(file.size)}</span>
                              <span className={`text-[10px] font-medium shrink-0 ${expiring ? 'text-red-400' : 'text-amber-400'}`}>{rem === 0 ? 'Kedaluwarsa' : `${rem}h`}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => handleRestoreFile(file.id, file.name)} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition" title="Pulihkan"><IconRestore /></button>
                                <button onClick={() => handlePermanentDelete(file.id, file.name)} className="p-1 text-red-400 hover:bg-red-500/10 rounded-lg transition" title="Hapus permanen"><IconTrash /></button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <>
                  {/* Info banner */}
                  <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-5 text-sm text-amber-400 font-medium">
                    <IconClock />
                    <span>File di sampah akan dihapus otomatis setelah <strong>7 hari</strong>. Pulihkan file sebelum batas waktu habis.</span>
                  </div>

                  {trashFiles.length === 0 ? (
                    <div className="py-20 text-center border border-dashed border-[#334155] rounded-xl bg-[#1e293b]/50">
                      <svg className="h-12 w-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      <p className="text-sm font-medium text-slate-400">Sampah kosong</p>
                      <p className="text-xs text-slate-600 mt-1">File yang dihapus akan muncul di sini selama 7 hari.</p>
                    </div>
                  ) : (
                    <>
                      {/* Toolbar */}
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-medium text-slate-400">{trashFiles.length} item di sampah</span>
                        <button
                          onClick={() => {
                            if (window.confirm('Hapus semua file di sampah secara permanen?')) {
                              Promise.all(trashFiles.map(f => axios.delete(`${BACKEND_URL}/api/files/${f.id}/permanent`)))
                                .then(() => { showToast('Semua file di sampah dihapus permanen.', 'success'); fetchTrash(); })
                                .catch(() => showToast('Gagal mengosongkan sampah.', 'error'));
                            }
                          }}
                          className="text-sm font-medium text-red-400 hover:text-red-300 transition"
                        >
                          Kosongkan sampah
                        </button>
                      </div>

                      {/* Folder groups */}
                      {folderGroups.size > 0 && (
                        <div className="mb-4">
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Dari Folder</p>
                          {Array.from(folderGroups.entries()).map(([folderId, { folderName, files: groupFiles }]) => (
                            <TrashFolderGroup key={folderId} folderId={folderId} folderName={folderName} groupFiles={groupFiles} />
                          ))}
                        </div>
                      )}

                      {/* Files without folder */}
                      {filesWithoutFolder.length > 0 && (
                        <>
                          {folderGroups.size > 0 && (
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">File Lainnya</p>
                          )}
                          <div className="bg-[#1e293b] rounded-xl border border-[#334155] overflow-hidden overflow-x-auto">
                            <table className="w-full text-left min-w-[650px] md:min-w-0">
                              <thead>
                                <tr className="text-[11px] font-medium text-slate-500 tracking-wider border-b border-[#334155]">
                                  <th className="py-2.5 pt-3 px-4 w-10 shrink-0">
                                    <input
                                      type="checkbox"
                                      checked={filesWithoutFolder.length > 0 && filesWithoutFolder.every(f => selectedFileIds.includes(f.id))}
                                      onChange={(e) => {
                                        const ids = filesWithoutFolder.map(f => f.id);
                                        if (e.target.checked) setSelectedFileIds(prev => Array.from(new Set([...prev, ...ids])));
                                        else setSelectedFileIds(prev => prev.filter(id => !ids.includes(id)));
                                      }}
                                      className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                    />
                                  </th>
                                  <th className="pb-2.5 pt-3 px-4">Nama</th>
                                  <th className="pb-2.5 pt-3 px-4">Ukuran</th>
                                  <th className="pb-2.5 pt-3 px-4">Dihapus</th>
                                  <th className="pb-2.5 pt-3 px-4">Sisa Waktu</th>
                                  <th className="pb-2.5 pt-3 px-4 text-right">Aksi</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#1e293b] text-sm text-slate-400">
                                {filesWithoutFolder.map(file => {
                                  const { label, bg } = getFileExtLabel(file.type, file.name);
                                  const remaining = file.deleted_at ? daysLeft(file.deleted_at) : 0;
                                  const isExpiringSoon = remaining <= 1;
                                  const isChecked = selectedFileIds.includes(file.id);
                                  return (
                                    <tr key={file.id} className={`group hover:bg-[#243347] transition-colors ${isChecked ? 'bg-blue-500/5' : ''}`}>
                                      <td className="py-3 px-4 w-10 shrink-0" onClick={e => e.stopPropagation()}>
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => setSelectedFileIds(prev => prev.includes(file.id) ? prev.filter(id => id !== file.id) : [...prev, file.id])}
                                          className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                        />
                                      </td>
                                      <td className="py-3 px-4 flex items-center gap-2.5">
                                        <div className={`${bg} text-white rounded-md w-7 h-7 flex items-center justify-center text-[9px] font-bold tracking-wider shrink-0 opacity-50`}>{label}</div>
                                        <span className="font-medium text-slate-400 truncate max-w-[200px]">{file.name}</span>
                                      </td>
                                      <td className="py-3 px-4">{formatBytes(file.size)}</td>
                                      <td className="py-3 px-4">{file.deleted_at ? timeAgo(file.deleted_at) : '-'}</td>
                                      <td className="py-3 px-4">
                                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isExpiringSoon ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                                          <IconClock />
                                          {remaining === 0 ? 'Kedaluwarsa' : `${remaining} hari lagi`}
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                          <button onClick={() => handleRestoreFile(file.id, file.name)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition border border-emerald-500/20 hover:border-emerald-500/40">
                                            <IconRestore />Pulihkan
                                          </button>
                                          <button onClick={() => handlePermanentDelete(file.id, file.name)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition border border-red-500/20 hover:border-red-500/40">
                                            <IconTrash />Hapus
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </>
              );
            })()}


          </div>
        </main>
        {/* ── End Main Content ── */}

        {/* ── Right Detail Sidebar ── */}
        {selectedFile && (
          <aside className="w-72 bg-[#111827] border-l border-[#1e293b] overflow-y-auto shrink-0">
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-[#1e293b]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`${getFileExtLabel(selectedFile.type, selectedFile.name).bg} text-white rounded-md w-6 h-6 flex items-center justify-center text-[9px] font-bold shrink-0`}>
                  {getFileExtLabel(selectedFile.type, selectedFile.name).label}
                </div>
                <h3 className="font-medium text-slate-200 text-sm truncate">{selectedFile.name}</h3>
              </div>
              <button onClick={() => setSelectedFile(null)} className="text-slate-500 hover:text-slate-300 transition shrink-0 ml-2"><IconX /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#1e293b] px-2">
              {(['detail', 'activity', 'comments'] as DetailTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  className={`flex-1 py-3 text-xs font-medium transition capitalize ${detailTab === tab ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {tab === 'detail' ? 'Detail' : tab === 'activity' ? 'Aktivitas' : 'Komentar'}
                </button>
              ))}
            </div>

            <div className="p-4">
              {detailTab === 'detail' && (
                <>
                  {/* File Preview */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Preview</span>
                      <a href={`${BACKEND_URL}${selectedFile.path}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue-400 hover:text-blue-300 font-medium transition">Buka →</a>
                    </div>
                    <FilePreview file={selectedFile} backendUrl={BACKEND_URL} />
                  </div>

                  {/* Metadata */}
                  <div className="space-y-3 mb-6">
                    {[
                      { label: 'Jenis', value: getFileMimeLabel(selectedFile.type, selectedFile.name) },
                      { label: 'Ukuran', value: formatBytes(selectedFile.size) },
                      { label: 'Pemilik', value: selectedFile.owner === currentUser.email ? 'Anda' : selectedFile.owner },
                      { label: 'Dibuat', value: new Date(selectedFile.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">{row.label}</span>
                        <span className="font-medium text-slate-300 text-right max-w-[160px] truncate">{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t border-[#1e293b]">
                    <a
                      href={`${BACKEND_URL}${selectedFile.path}`} download={selectedFile.name} target="_blank" rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 transition shadow-lg shadow-blue-500/20"
                    >
                      <IconDownload />Unduh
                    </a>
                    <button
                      onClick={() => handleToggleFavorite(selectedFile)}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border text-xs font-medium transition ${selectedFile.is_favorited ? 'border-amber-500/40 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20' : 'border-[#334155] text-slate-400 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/30'}`}
                      title={selectedFile.is_favorited ? 'Hapus dari favorit' : 'Tambah ke favorit'}
                    >
                      <svg className="h-4 w-4" fill={selectedFile.is_favorited ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                    </button>
                    <button
                      onClick={() => handleFileDelete(selectedFile.id, selectedFile.name)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-[#334155] text-slate-400 text-xs font-medium hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition"
                    >
                      <IconTrash />
                    </button>
                    <button
                      onClick={() => handleOpenShareModal('file', selectedFile.id, selectedFile.name)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-[#334155] text-slate-400 text-xs font-medium hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/30 transition"
                    >
                      <IconShare />
                    </button>
                  </div>

                  {/* Share section */}
                  <div className="pt-4 mt-4 border-t border-[#1e293b]">
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Dibagikan dengan</h4>
                    <p className="text-xs text-slate-600 italic">Belum dibagikan ke siapapun.</p>
                    <button
                      onClick={() => handleOpenShareModal('file', selectedFile.id, selectedFile.name)}
                      className="mt-3 flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition"
                    >
                      <IconPlus />Bagikan dengan orang lain
                    </button>
                  </div>
                </>
              )}

              {detailTab === 'activity' && (
                <div className="py-8 text-center">
                  <p className="text-xs text-slate-500">Belum ada aktivitas untuk berkas ini.</p>
                </div>
              )}

              {detailTab === 'comments' && (
                <div className="py-8 text-center">
                  <p className="text-xs text-slate-500">Belum ada komentar untuk berkas ini.</p>
                </div>
              )}
            </div>
          </aside>
        )}
        {/* ── End Right Detail Sidebar ── */}

      </div>
      {/* Floating Bulk Action Bar */}
      {selectedFileIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1e293b]/95 border border-blue-500/30 backdrop-blur-md px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-5 text-sm z-50 animate-slide-up" style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
          <div className="flex items-center gap-2">
            <span className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
              {selectedFileIds.length}
            </span>
            <span className="font-semibold text-slate-200">file terpilih</span>
          </div>
          
          <div className="h-4 w-px bg-[#334155]" />
          
          <div className="flex items-center gap-1.5">
            {activeNav !== 'trash' ? (
              <>
                <button
                  onClick={handleBulkFavorite}
                  className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-700/50 rounded-lg text-amber-400 font-medium transition"
                  title="Favoritkan terpilih"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                  Favorit
                </button>
                <button
                  onClick={handleBulkDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-700/50 rounded-lg text-blue-400 font-medium transition"
                  title="Unduh terpilih"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>
                  Unduh
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-red-500/10 rounded-lg text-red-400 font-medium transition"
                  title="Hapus terpilih"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>
                  Hapus
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleBulkRestore}
                  className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-emerald-500/10 rounded-lg text-emerald-400 font-medium transition"
                  title="Pulihkan terpilih"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>
                  Pulihkan
                </button>
                <button
                  onClick={handleBulkPermanentDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-red-500/10 rounded-lg text-red-400 font-medium transition"
                  title="Hapus permanen terpilih"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>
                  Hapus Permanen
                </button>
              </>
            )}
          </div>
          
          <div className="h-4 w-px bg-[#334155]" />
          
          <button
            onClick={() => setSelectedFileIds([])}
            className="text-slate-400 hover:text-slate-200 transition text-xs font-semibold"
          >
            Batal
          </button>
        </div>
      )}

      {/* Unified Activity Panel */}
      {showActivityPanel && activityQueue.length > 0 && (
        <ActivityPanel
          items={activityQueue}
          onClose={() => setShowActivityPanel(false)}
          onClear={() => { setActivityQueue([]); setShowActivityPanel(false); }}
        />
      )}
    </div>
  );
}
