import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Settings,
  Upload,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sparkles,
  Check,
  X,
  Printer,
  Image as ImageIcon,
  Type,
  LayoutGrid
} from 'lucide-react';
import { apiRequest, formatDateBR } from '../api';

const MONTH_NAMES = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO'
];

export default function PhotoReportModal({
  isOpen,
  onClose,
  photos,
  projects,
  selectedProjectId,
  yearFilter,
  monthFilter
}) {
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [activeTab, setActiveTab] = useState('PREVIEW'); // 'PREVIEW' | 'CONFIG'

  const [settings, setSettings] = useState({
    orientation: 'PORTRAIT', // 'PORTRAIT' | 'LANDSCAPE'
    photos_per_page: 6, // 2 | 4 | 6
    banner_mode: 'TEXT', // 'TEXT' | 'IMAGE' | 'BOTH'
    banner_image_url: '',
    banner_image_base64: '',
    banner_text:
      'AXIS OBRA ENGENHARIA E CONSTRUÇÕES LTDA\nSUPERINTENDÊNCIA DE ENGENHARIA E CONTROLE DE QUALIDADE',
    banner_text_align: 'CENTER', // 'LEFT' | 'CENTER' | 'RIGHT'
    banner_font_size: 'MEDIUM', // 'SMALL' | 'MEDIUM' | 'LARGE'
    banner_bold: true,
    banner_italic: false,
    banner_underline: false,
    banner_color: '#0f172a',
    subheader_text: '',
    subheader_align: 'CENTER',
    subheader_bold: true,
    footer_text: 'Contrato n. CO141/2026 - DT',
    show_empty_placeholders: true
  });

  // Compute smart default for the line right below the banner divider
  const defaultSubheaderLine = useMemo(() => {
    const activeProj =
      selectedProjectId && selectedProjectId !== 'ALL'
        ? projects.find((p) => String(p.id) === String(selectedProjectId))
        : projects.length === 1
        ? projects[0]
        : null;

    const obraPart = activeProj
      ? `OBRA: ${activeProj.name.toUpperCase()}`
      : 'OBRA: CONSOLIDADO DE EMPREENDIMENTOS AXIS OBRA';

    const localPart = activeProj
      ? `LOCAL: ${activeProj.address.toUpperCase()} – ${activeProj.city.toUpperCase()}/${activeProj.state.toUpperCase()}`
      : 'LOCAL: CANTEIROS VINCULADOS';

    let periodoPart = 'PERÍODO: GERAL';
    if (monthFilter !== 'ALL' && yearFilter !== 'ALL') {
      const mIdx = Math.max(0, Math.min(11, Number(monthFilter) - 1));
      periodoPart = `PERÍODO: ${MONTH_NAMES[mIdx]}/${yearFilter}`;
    } else if (yearFilter !== 'ALL') {
      periodoPart = `PERÍODO: ANO ${yearFilter}`;
    } else if (photos.length > 0) {
      const sampleDate = String(photos[0].taken_at || '').slice(0, 7);
      const [y, m] = sampleDate.split('-');
      if (y && m) {
        const mIdx = Math.max(0, Math.min(11, Number(m) - 1));
        periodoPart = `PERÍODO: ${MONTH_NAMES[mIdx]}/${y}`;
      }
    }

    return `${obraPart} | ${localPart} | ${periodoPart}`;
  }, [selectedProjectId, projects, yearFilter, monthFilter, photos]);

  useEffect(() => {
    if (!isOpen) return;
    apiRequest('/api/report-settings')
      .then((data) => {
        if (data && data.id) {
          setSettings((prev) => ({
            ...prev,
            orientation: data.orientation || 'PORTRAIT',
            photos_per_page: Number(data.photos_per_page) || 6,
            banner_mode: data.banner_mode || 'TEXT',
            banner_image_url: data.banner_image_url || '',
            banner_image_base64: '',
            banner_text: data.banner_text ?? prev.banner_text,
            banner_text_align: data.banner_text_align || 'CENTER',
            banner_font_size: data.banner_font_size || 'MEDIUM',
            banner_bold: Boolean(data.banner_bold),
            banner_italic: Boolean(data.banner_italic),
            banner_underline: Boolean(data.banner_underline),
            banner_color: data.banner_color || '#0f172a',
            subheader_text: data.subheader_text || defaultSubheaderLine,
            subheader_align: data.subheader_align || 'CENTER',
            subheader_bold: data.subheader_bold !== undefined ? Boolean(data.subheader_bold) : true,
            footer_text: data.footer_text ?? 'Contrato n. CO141/2026 - DT',
            show_empty_placeholders:
              data.show_empty_placeholders !== undefined ? Boolean(data.show_empty_placeholders) : true
          }));
        } else {
          setSettings((prev) => ({
            ...prev,
            subheader_text: prev.subheader_text || defaultSubheaderLine
          }));
        }
      })
      .catch(() => {
        setSettings((prev) => ({
          ...prev,
          subheader_text: prev.subheader_text || defaultSubheaderLine
        }));
      });
  }, [isOpen, defaultSubheaderLine]);

  if (!isOpen) return null;

  const handleBannerFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSettings((prev) => ({
        ...prev,
        banner_mode: prev.banner_mode === 'TEXT' ? 'IMAGE' : prev.banner_mode,
        banner_image_base64: reader.result
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const updated = await apiRequest('/api/report-settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      setSettings((prev) => ({
        ...prev,
        banner_image_url: updated.banner_image_url || prev.banner_image_url,
        banner_image_base64: ''
      }));
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Split photos into pages of `photos_per_page` (2, 4, or 6)
  const perPage = Number(settings.photos_per_page) || 6;
  const pages = [];
  for (let i = 0; i < photos.length; i += perPage) {
    const chunk = photos.slice(i, i + perPage);
    if (settings.show_empty_placeholders && chunk.length < perPage) {
      const missing = perPage - chunk.length;
      for (let m = 0; m < missing; m++) {
        chunk.push({ isPlaceholder: true, id: `placeholder-${i}-${m}` });
      }
    }
    pages.push(chunk);
  }
  if (pages.length === 0) {
    const emptyChunk = [];
    for (let m = 0; m < perPage; m++) {
      emptyChunk.push({ isPlaceholder: true, id: `placeholder-0-${m}` });
    }
    pages.push(emptyChunk);
  }

  // Determine grid layout classes & dimensions based on orientation + photos_per_page
  const isLandscape = settings.orientation === 'LANDSCAPE';
  const getGridColsRows = () => {
    if (perPage === 2) {
      return isLandscape ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 };
    }
    if (perPage === 4) {
      return { cols: 2, rows: 2 };
    }
    // 6 photos per page
    return isLandscape ? { cols: 3, rows: 2 } : { cols: 2, rows: 3 };
  };
  const { cols, rows } = getGridColsRows();

  const activeBannerSrc = settings.banner_image_base64 || settings.banner_image_url;
  const effectiveSubheaderText = settings.subheader_text || defaultSubheaderLine;

  // ============================================================================
  // EXPORT TO PDF (OPENS DEDICATED A4 PRINT WINDOW MATCHING THE MODEL)
  // ============================================================================
  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank', 'width=1100,height=850');
    if (!printWindow) {
      alert('Permita pop-ups no navegador para gerar o PDF do Relatório Fotográfico.');
      return;
    }

    const pageSizeCss = isLandscape ? 'A4 landscape' : 'A4 portrait';
    const pageWidthMm = isLandscape ? 297 : 210;
    const pageHeightMm = isLandscape ? 210 : 297;

    // Calculate cell image height in mm so that banner + subheader + grid + footer fit on 1 exact A4 sheet
    const usableHeightMm = pageHeightMm - 20 - 24 - 11 - 10; // margins + banner + subheader + footer
    const cellTotalHeightMm = Math.floor((usableHeightMm - (rows - 1) * 4) / rows);
    const cellCaptionHeightMm = 14;
    const cellImgHeightMm = Math.max(35, cellTotalHeightMm - cellCaptionHeightMm);

    const fontSizeMap = {
      SMALL: '12px',
      MEDIUM: '15px',
      LARGE: '19px'
    };

    const alignMap = {
      LEFT: 'left',
      CENTER: 'center',
      RIGHT: 'right'
    };

    const originUrl = window.location.origin;
    const resolveImgUrl = (url) => {
      if (!url) return '';
      if (url.startsWith('data:') || url.startsWith('http')) return url;
      return `${originUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    };

    const bannerHtml = () => {
      const showImg = (settings.banner_mode === 'IMAGE' || settings.banner_mode === 'BOTH') && activeBannerSrc;
      const showTxt = settings.banner_mode === 'TEXT' || settings.banner_mode === 'BOTH' || !activeBannerSrc;

      return `
        <div class="banner-box" style="text-align: ${alignMap[settings.banner_text_align] || 'center'};">
          ${
            showImg
              ? `<img src="${resolveImgUrl(activeBannerSrc)}" class="banner-img" alt="Banner" />`
              : ''
          }
          ${
            showTxt && settings.banner_text
              ? `<div class="banner-text" style="
                  font-size: ${fontSizeMap[settings.banner_font_size] || '15px'};
                  font-weight: ${settings.banner_bold ? '700' : '400'};
                  font-style: ${settings.banner_italic ? 'italic' : 'normal'};
                  text-decoration: ${settings.banner_underline ? 'underline' : 'none'};
                  color: ${settings.banner_color || '#0f172a'};
                  text-align: ${alignMap[settings.banner_text_align] || 'center'};
                ">${String(settings.banner_text)
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/\n/g, '<br/>')}</div>`
              : ''
          }
        </div>
      `;
    };

    const pagesHtml = pages
      .map((pageItems, pageIndex) => {
        const cellsHtml = pageItems
          .map((item) => {
            if (item.isPlaceholder) {
              return `
                <div class="photo-cell placeholder-cell" style="height: ${cellTotalHeightMm}mm;">
                  <span>Espaço reservado para registro fotográfico</span>
                </div>
              `;
            }

            const dateFormatted = formatDateBR(item.taken_at);
            const obraLabel = item.project_name || item.project_code || 'Obra';
            const localLabel = item.location_area || 'Canteiro';
            const servicoLabel = item.title + (item.description ? ` — ${item.description}` : '');

            return `
              <div class="photo-cell" style="height: ${cellTotalHeightMm}mm;">
                <div class="photo-img-wrap" style="height: ${cellImgHeightMm}mm;">
                  <img src="${resolveImgUrl(item.image_url)}" alt="${(item.title || '').replace(/"/g, '&quot;')}" />
                </div>
                <div class="photo-caption" style="height: ${cellCaptionHeightMm}mm;">
                  <div class="caption-line">
                    <strong>Data:</strong> ${dateFormatted} | <strong>Obra:</strong> ${obraLabel} | <strong>Local:</strong> ${localLabel}
                  </div>
                  <div class="caption-line">
                    <strong>Serviço:</strong> ${servicoLabel}
                  </div>
                </div>
              </div>
            `;
          })
          .join('');

        return `
          <div class="report-page">
            ${bannerHtml()}
            <div class="divider-line"></div>
            <div class="subheader-line" style="
              text-align: ${alignMap[settings.subheader_align] || 'center'};
              font-weight: ${settings.subheader_bold ? '700' : '500'};
            ">
              ${String(effectiveSubheaderText).replace(/</g, '&lt;').replace(/>/g, '&gt;')}
            </div>

            <div class="photos-grid" style="
              grid-template-columns: repeat(${cols}, 1fr);
              grid-template-rows: repeat(${rows}, ${cellTotalHeightMm}mm);
            ">
              ${cellsHtml}
            </div>

            <div class="page-footer">
              <div class="footer-left"></div>
              <div class="footer-center">${String(settings.footer_text || '').replace(/</g, '&lt;')}</div>
              <div class="footer-right">${pageIndex + 1}</div>
            </div>
          </div>
        `;
      })
      .join('');

    printWindow.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Relatório Fotográfico — AXIS OBRA</title>
          <style>
            @page {
              size: ${pageSizeCss};
              margin: 0;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, Helvetica, sans-serif;
              background: #e2e8f0;
              color: #0f172a;
            }
            .print-toolbar {
              position: sticky;
              top: 0;
              z-index: 100;
              background: #0f172a;
              color: #fff;
              padding: 10px 24px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              box-shadow: 0 2px 10px rgba(0,0,0,0.25);
            }
            .print-toolbar button {
              background: #f59e0b;
              color: #0f172a;
              border: none;
              padding: 8px 18px;
              border-radius: 6px;
              font-weight: 700;
              font-size: 13px;
              cursor: pointer;
            }
            .report-page {
              width: ${pageWidthMm}mm;
              height: ${pageHeightMm}mm;
              padding: 10mm 12mm 8mm 12mm;
              margin: 12px auto;
              background: #ffffff;
              box-shadow: 0 4px 16px rgba(0,0,0,0.12);
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              page-break-after: always;
              break-after: page;
              overflow: hidden;
            }
            .report-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            .banner-box {
              min-height: 18mm;
              max-height: 22mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 3px;
              overflow: hidden;
            }
            .banner-img {
              max-height: 18mm;
              max-width: 100%;
              object-fit: contain;
            }
            .banner-text {
              width: 100%;
              line-height: 1.25;
            }
            .divider-line {
              border-bottom: 1.5px solid #0f172a;
              margin: 1.5mm 0 2mm 0;
            }
            .subheader-line {
              font-size: 12px;
              letter-spacing: 0.2px;
              color: #0f172a;
              margin-bottom: 2.5mm;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .photos-grid {
              display: grid;
              gap: 3.5mm;
              flex: 1;
            }
            .photo-cell {
              border: 1px solid #94a3b8;
              padding: 1.8mm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              background: #fff;
              overflow: hidden;
            }
            .placeholder-cell {
              align-items: center;
              justify-content: center;
              color: #94a3b8;
              font-size: 12px;
              text-align: center;
            }
            .photo-img-wrap {
              width: 100%;
              background: #f8fafc;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .photo-img-wrap img {
              width: 100%;
              height: 100%;
              object-fit: cover;
              display: block;
            }
            .photo-caption {
              padding-top: 1.5mm;
              display: flex;
              flex-direction: column;
              justify-content: center;
              gap: 1mm;
              font-size: 9.5px;
              line-height: 1.2;
              color: #1e293b;
            }
            .caption-line {
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .page-footer {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding-top: 2mm;
              font-size: 10.5px;
              color: #1e293b;
            }
            .footer-left, .footer-right {
              width: 60px;
            }
            .footer-right {
              text-align: right;
              font-weight: 600;
            }
            .footer-center {
              flex: 1;
              text-align: center;
            }
            @media print {
              body {
                background: #ffffff;
              }
              .print-toolbar {
                display: none !important;
              }
              .report-page {
                margin: 0;
                box-shadow: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-toolbar">
            <div>
              <strong>AXIS OBRA — Relatório Fotográfico Pronto (${pages.length} página${pages.length > 1 ? 's' : ''})</strong>
              <span style="font-size: 12px; color: #cbd5e1; margin-left: 12px;">
                Na janela de impressão, selecione "Salvar como PDF"
              </span>
            </div>
            <button onclick="window.print()">🖨️ Salvar em PDF / Imprimir</button>
          </div>
          ${pagesHtml}
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 400);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ============================================================================
  // EXPORT TO EXCEL (.XLS SPREADSHEET WITH HEADER, SUBHEADER & STRUCTURED TABLE)
  // ============================================================================
  const handleExportExcel = () => {
    const originUrl = window.location.origin;
    const rowsHtml = photos
      .map((p, idx) => {
        const fullImgUrl = p.image_url?.startsWith('http')
          ? p.image_url
          : `${originUrl}${p.image_url || ''}`;
        return `
          <tr>
            <td style="text-align:center; border:1px solid #cbd5e1; padding:6px;">${idx + 1}</td>
            <td style="text-align:center; border:1px solid #cbd5e1; padding:6px;">${formatDateBR(p.taken_at)}</td>
            <td style="border:1px solid #cbd5e1; padding:6px;">${p.project_code || ''} — ${p.project_name || ''}</td>
            <td style="border:1px solid #cbd5e1; padding:6px;">${p.location_area || '—'}</td>
            <td style="border:1px solid #cbd5e1; padding:6px;">${p.stage || '—'}</td>
            <td style="border:1px solid #cbd5e1; padding:6px; font-weight:bold;">${p.title || ''}</td>
            <td style="border:1px solid #cbd5e1; padding:6px;">${p.description || ''}</td>
            <td style="text-align:center; border:1px solid #cbd5e1; padding:6px;">${p.weather_condition || 'SOL'}</td>
            <td style="border:1px solid #cbd5e1; padding:6px;">${p.author_name || 'Equipe Técnica'}</td>
            <td style="border:1px solid #cbd5e1; padding:6px;"><a href="${fullImgUrl}">${fullImgUrl}</a></td>
          </tr>
        `;
      })
      .join('');

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="UTF-8" />
        </head>
        <body>
          <table border="1" style="border-collapse:collapse; font-family:Arial, sans-serif; font-size:12px;">
            <tr>
              <td colspan="10" style="text-align:center; font-size:15px; font-weight:bold; background:#f8fafc; padding:10px;">
                ${String(settings.banner_text || 'AXIS OBRA — RELATÓRIO FOTOGRÁFICO').replace(/\n/g, ' — ')}
              </td>
            </tr>
            <tr>
              <td colspan="10" style="text-align:center; font-size:12px; font-weight:bold; background:#fef3c7; padding:8px;">
                ${effectiveSubheaderText}
              </td>
            </tr>
            <tr style="background:#0f172a; color:#ffffff; font-weight:bold; text-align:center;">
              <th style="padding:8px;">Item</th>
              <th style="padding:8px;">Data</th>
              <th style="padding:8px;">Obra</th>
              <th style="padding:8px;">Local / Trecho / Setor</th>
              <th style="padding:8px;">Etapa Construtiva</th>
              <th style="padding:8px;">Serviço / Título</th>
              <th style="padding:8px;">Descrição / Detalhamento Técnico</th>
              <th style="padding:8px;">Clima</th>
              <th style="padding:8px;">Responsável</th>
              <th style="padding:8px;">Link da Fotografia</th>
            </tr>
            ${rowsHtml}
            <tr>
              <td colspan="10" style="text-align:center; font-style:italic; padding:8px; background:#f1f5f9;">
                ${settings.footer_text || ''} • Total de Registros Exportados: ${photos.length}
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', excelHtml], {
      type: 'application/vnd.ms-excel;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Relatorio_Fotografico_Axis_Obra_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-6xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500 text-slate-950">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">
                Relatório Fotográfico de Obra — Configuração e Exportação (PDF / Excel)
              </h3>
              <p className="text-xs text-slate-300">
                {photos.length} foto(s) selecionada(s) no filtro atual • Distribuídas em {pages.length} página(s) ({perPage} fotos/página)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Switch between Config and Preview */}
            <div className="inline-flex rounded-lg bg-slate-800 p-1 border border-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab('CONFIG')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition ${
                  activeTab === 'CONFIG'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                Configurar Layout e Banner
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('PREVIEW')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition ${
                  activeTab === 'PREVIEW'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Pré-Visualizar Páginas ({pages.length})
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar Excel (.xls)
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition"
            >
              <Printer className="w-4 h-4" />
              Gerar PDF / Imprimir
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
          {activeTab === 'CONFIG' ? (
            /* =================================================================
               ABA DE CONFIGURAÇÃO DO RELATÓRIO (ITENS 1, 2, 3 e 4 DO USUÁRIO)
               ================================================================= */
            <div className="max-w-4xl mx-auto space-y-6">
              {/* 1 & 2: Orientation and Photos per Page */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-amber-600" />
                  1 e 2. Formato da Página e Quantidade de Fotos por Página
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* 1. Orientation */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      1. Formato / Orientação do Relatório:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { id: 'PORTRAIT', label: 'Retrato (Vertical)', desc: 'Padrão A4 Vertical' },
                        { id: 'LANDSCAPE', label: 'Paisagem (Horizontal)', desc: 'Padrão A4 Horizontal' }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSettings({ ...settings, orientation: opt.id })}
                          className={`p-3 rounded-xl border text-left transition ${
                            settings.orientation === opt.id
                              ? 'bg-amber-50 border-amber-500 text-slate-900 ring-2 ring-amber-500/20'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
                          }`}
                        >
                          <div className="font-bold text-xs">{opt.label}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Photos per page */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      2. Quantidade de Fotos por Página:
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        { count: 2, desc: '2 fotos grandes' },
                        { count: 4, desc: '2 col × 2 lin' },
                        { count: 6, desc: '2 col × 3 lin (Modelo)' }
                      ].map((opt) => (
                        <button
                          key={opt.count}
                          type="button"
                          onClick={() => setSettings({ ...settings, photos_per_page: opt.count })}
                          className={`p-3 rounded-xl border text-center transition ${
                            Number(settings.photos_per_page) === opt.count
                              ? 'bg-amber-50 border-amber-500 text-slate-900 ring-2 ring-amber-500/20'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
                          }`}
                        >
                          <div className="font-extrabold text-base text-amber-600">{opt.count} fotos</div>
                          <div className="text-[11px] text-slate-500">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Banner Configuration (Import Image OR Formatted Text Box) */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-amber-600" />
                    3. Espaço do Banner Superior (Acima da Linha Divisória)
                  </h4>

                  <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200">
                    {[
                      { id: 'TEXT', label: 'Caixa de Texto Formatada' },
                      { id: 'IMAGE', label: 'Importar Imagem de Banner' },
                      { id: 'BOTH', label: 'Imagem + Texto' }
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSettings({ ...settings, banner_mode: m.id })}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                          settings.banner_mode === m.id
                            ? 'bg-white text-slate-900 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Banner Image Upload */}
                {(settings.banner_mode === 'IMAGE' || settings.banner_mode === 'BOTH') && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <label className="block text-xs font-bold text-slate-700">
                      Importar Imagem do Banner (Logos da Construtora / Cliente / Órgão):
                    </label>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition">
                        <Upload className="w-4 h-4 text-amber-400" />
                        Selecionar Imagem do Banner (PNG, JPG, SVG)
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleBannerFileChange}
                          className="hidden"
                        />
                      </label>
                      {activeBannerSrc && (
                        <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200">
                          <img
                            src={activeBannerSrc}
                            alt="Preview do Banner"
                            className="h-12 object-contain"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setSettings({
                                ...settings,
                                banner_image_url: '',
                                banner_image_base64: ''
                              })
                            }
                            className="text-xs text-rose-600 hover:underline font-semibold"
                          >
                            Remover
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Banner Rich Text Box with Formatting Toolbar */}
                {(settings.banner_mode === 'TEXT' || settings.banner_mode === 'BOTH') && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-2 rounded-t-xl border border-b-0 border-slate-300">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-slate-600 px-2 flex items-center gap-1">
                          <Type className="w-3.5 h-3.5" /> Formatação:
                        </span>
                        {/* Bold */}
                        <button
                          type="button"
                          onClick={() => setSettings({ ...settings, banner_bold: !settings.banner_bold })}
                          className={`p-1.5 rounded ${
                            settings.banner_bold
                              ? 'bg-slate-900 text-amber-400'
                              : 'hover:bg-slate-200 text-slate-700'
                          }`}
                          title="Negrito"
                        >
                          <Bold className="w-4 h-4" />
                        </button>
                        {/* Italic */}
                        <button
                          type="button"
                          onClick={() => setSettings({ ...settings, banner_italic: !settings.banner_italic })}
                          className={`p-1.5 rounded ${
                            settings.banner_italic
                              ? 'bg-slate-900 text-amber-400'
                              : 'hover:bg-slate-200 text-slate-700'
                          }`}
                          title="Itálico"
                        >
                          <Italic className="w-4 h-4" />
                        </button>
                        {/* Underline */}
                        <button
                          type="button"
                          onClick={() =>
                            setSettings({ ...settings, banner_underline: !settings.banner_underline })
                          }
                          className={`p-1.5 rounded ${
                            settings.banner_underline
                              ? 'bg-slate-900 text-amber-400'
                              : 'hover:bg-slate-200 text-slate-700'
                          }`}
                          title="Sublinhado"
                        >
                          <Underline className="w-4 h-4" />
                        </button>

                        <div className="h-4 w-px bg-slate-300 mx-1" />

                        {/* Alignment */}
                        {[
                          { id: 'LEFT', icon: AlignLeft, title: 'Alinhar à Esquerda' },
                          { id: 'CENTER', icon: AlignCenter, title: 'Centralizar' },
                          { id: 'RIGHT', icon: AlignRight, title: 'Alinhar à Direita' }
                        ].map((al) => {
                          const Icon = al.icon;
                          return (
                            <button
                              key={al.id}
                              type="button"
                              onClick={() => setSettings({ ...settings, banner_text_align: al.id })}
                              className={`p-1.5 rounded ${
                                settings.banner_text_align === al.id
                                  ? 'bg-slate-900 text-amber-400'
                                  : 'hover:bg-slate-200 text-slate-700'
                              }`}
                              title={al.title}
                            >
                              <Icon className="w-4 h-4" />
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={settings.banner_font_size}
                          onChange={(e) => setSettings({ ...settings, banner_font_size: e.target.value })}
                          className="px-2 py-1 rounded border border-slate-300 text-xs bg-white font-semibold"
                        >
                          <option value="SMALL">Fonte Pequena</option>
                          <option value="MEDIUM">Fonte Média</option>
                          <option value="LARGE">Fonte Grande</option>
                        </select>

                        <input
                          type="color"
                          value={settings.banner_color}
                          onChange={(e) => setSettings({ ...settings, banner_color: e.target.value })}
                          className="w-7 h-7 rounded cursor-pointer border border-slate-300 bg-white p-0.5"
                          title="Cor do Texto do Banner"
                        />
                      </div>
                    </div>

                    <textarea
                      rows={3}
                      placeholder="Digite o texto institucional do cabeçalho / empresa / superintendência / cliente..."
                      value={settings.banner_text}
                      onChange={(e) => setSettings({ ...settings, banner_text: e.target.value })}
                      style={{
                        textAlign:
                          settings.banner_text_align === 'LEFT'
                            ? 'left'
                            : settings.banner_text_align === 'RIGHT'
                            ? 'right'
                            : 'center',
                        fontWeight: settings.banner_bold ? '700' : '400',
                        fontStyle: settings.banner_italic ? 'italic' : 'normal',
                        textDecoration: settings.banner_underline ? 'underline' : 'none',
                        color: settings.banner_color
                      }}
                      className="w-full px-4 py-3 rounded-b-xl border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                )}
              </div>

              {/* 4. Line Below Banner Divider + Footer Configuration */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900">
                    4. Linha de Cabeçalho da Obra (Logo Abaixo da Linha Divisória do Banner) e Rodapé
                  </h4>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, subheader_text: defaultSubheaderLine })}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-md border border-amber-200 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Gerar Linha Automática (Obra | Local | Período)
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Texto da Linha Abaixo da Divisória (Ex: OBRA / TRECHO / LOCAL / PERÍODO):
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={settings.subheader_text}
                        onChange={(e) => setSettings({ ...settings, subheader_text: e.target.value })}
                        placeholder={defaultSubheaderLine}
                        className="flex-1 px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-bold text-slate-900"
                      />
                      <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() =>
                            setSettings({ ...settings, subheader_bold: !settings.subheader_bold })
                          }
                          className={`p-1.5 rounded ${
                            settings.subheader_bold ? 'bg-slate-900 text-amber-400' : 'text-slate-600'
                          }`}
                          title="Negrito"
                        >
                          <Bold className="w-4 h-4" />
                        </button>
                        {['LEFT', 'CENTER', 'RIGHT'].map((al) => {
                          const Icon =
                            al === 'LEFT' ? AlignLeft : al === 'RIGHT' ? AlignRight : AlignCenter;
                          return (
                            <button
                              key={al}
                              type="button"
                              onClick={() => setSettings({ ...settings, subheader_align: al })}
                              className={`p-1.5 rounded ${
                                settings.subheader_align === al
                                  ? 'bg-slate-900 text-amber-400'
                                  : 'text-slate-600'
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Informação Central do Rodapé (Após a última linha de fotos):
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Contrato n. CO141/2026 - DT"
                        value={settings.footer_text}
                        onChange={(e) => setSettings({ ...settings, footer_text: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm"
                      />
                    </div>

                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={settings.show_empty_placeholders}
                          onChange={(e) =>
                            setSettings({ ...settings, show_empty_placeholders: e.target.checked })
                          }
                          className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4"
                        />
                        Exibir quadros &ldquo;Espaço reservado para registro fotográfico&rdquo; para completar a última página
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Config Action */}
              <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
                <div className="text-xs text-slate-500">
                  {savedToast ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold">
                      <Check className="w-4 h-4" /> Configurações salvas no sistema com sucesso!
                    </span>
                  ) : (
                    'Salve suas preferências para utilizá-las em todos os relatórios futuros.'
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                  >
                    {savingSettings ? 'Salvando...' : 'Salvar Configuração Padrão'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('PREVIEW')}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition"
                  >
                    Ver Pré-Visualização das Páginas →
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* =================================================================
               ABA DE PRÉ-VISUALIZAÇÃO FIEL AO MODELO PDF (A4)
               ================================================================= */
            <div className="space-y-8">
              {pages.map((pageItems, pageIdx) => (
                <div
                  key={pageIdx}
                  className={`mx-auto bg-white shadow-lg border border-slate-300 p-6 sm:p-8 flex flex-col justify-between ${
                    isLandscape ? 'max-w-5xl' : 'max-w-3xl'
                  }`}
                >
                  {/* Top Banner */}
                  <div>
                    <div
                      className="min-h-16 flex flex-col justify-center gap-1.5 pb-2"
                      style={{
                        textAlign:
                          settings.banner_text_align === 'LEFT'
                            ? 'left'
                            : settings.banner_text_align === 'RIGHT'
                            ? 'right'
                            : 'center'
                      }}
                    >
                      {(settings.banner_mode === 'IMAGE' || settings.banner_mode === 'BOTH') &&
                        activeBannerSrc && (
                          <img
                            src={activeBannerSrc}
                            alt="Banner do Relatório"
                            className="max-h-16 object-contain mx-auto"
                          />
                        )}
                      {(settings.banner_mode === 'TEXT' ||
                        settings.banner_mode === 'BOTH' ||
                        !activeBannerSrc) &&
                        settings.banner_text && (
                          <div
                            style={{
                              fontSize:
                                settings.banner_font_size === 'SMALL'
                                  ? '12px'
                                  : settings.banner_font_size === 'LARGE'
                                  ? '18px'
                                  : '14px',
                              fontWeight: settings.banner_bold ? '700' : '400',
                              fontStyle: settings.banner_italic ? 'italic' : 'normal',
                              textDecoration: settings.banner_underline ? 'underline' : 'none',
                              color: settings.banner_color || '#0f172a',
                              whiteSpace: 'pre-line'
                            }}
                          >
                            {settings.banner_text}
                          </div>
                        )}
                    </div>

                    {/* Horizontal Divider Line */}
                    <div className="border-b-2 border-slate-900 my-1.5" />

                    {/* Configurable Subheader Line Right Below Divider */}
                    <div
                      className="py-1.5 text-xs sm:text-sm text-slate-900 tracking-tight"
                      style={{
                        textAlign:
                          settings.subheader_align === 'LEFT'
                            ? 'left'
                            : settings.subheader_align === 'RIGHT'
                            ? 'right'
                            : 'center',
                        fontWeight: settings.subheader_bold ? '700' : '500'
                      }}
                    >
                      {effectiveSubheaderText}
                    </div>
                  </div>

                  {/* Photos Grid (2, 4 or 6 per page) */}
                  <div
                    className="grid gap-4 my-3"
                    style={{
                      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
                    }}
                  >
                    {pageItems.map((item) =>
                      item.isPlaceholder ? (
                        <div
                          key={item.id}
                          className="border border-slate-300 bg-slate-50/40 p-2 flex items-center justify-center text-xs text-slate-400 h-64"
                        >
                          Espaço reservado para registro fotográfico
                        </div>
                      ) : (
                        <div
                          key={item.id}
                          className="border border-slate-400 p-2 bg-white flex flex-col justify-between"
                        >
                          <div className="h-48 bg-slate-100 overflow-hidden flex items-center justify-center">
                            <img
                              src={item.image_url}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="pt-2 text-[11px] text-slate-800 space-y-0.5 leading-snug">
                            <div className="truncate">
                              <strong>Data:</strong> {formatDateBR(item.taken_at)} |{' '}
                              <strong>Obra:</strong> {item.project_name || item.project_code} |{' '}
                              <strong>Local:</strong> {item.location_area || 'Canteiro'}
                            </div>
                            <div className="truncate">
                              <strong>Serviço:</strong> {item.title}
                              {item.description ? ` — ${item.description}` : ''}
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {/* Page Footer with Center Contract Info & Bottom-Right Page Number */}
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-700">
                    <span className="w-12" />
                    <span className="font-medium text-center">{settings.footer_text}</span>
                    <span className="w-12 text-right font-bold">{pageIdx + 1}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
