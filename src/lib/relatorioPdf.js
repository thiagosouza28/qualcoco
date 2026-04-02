import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import moment from 'moment';

const PAGE_MARGIN_X = 8;
const PAGE_TITLE_Y = 12;
const PAGE_SUBTITLE_Y = 17;
const PAGE_TABLE_START_Y = 21;
const PAGE_FOOTER_Y = 286;
const FOOTER_FONT_SIZE = 8;
const BODY_FONT_SIZE = 8.5;
const HEADER_FONT_SIZE = 8.5;
const TITLE_FONT_SIZE = 12;
const SUBTITLE_FONT_SIZE = 8.5;
const ROW_HEIGHT_MM = 6.1;
const MARKER_FILL = [187, 247, 208];
const MARKER_TEXT = [20, 83, 45];
const BORDER_COLOR = [17, 17, 17];
const TEXT_COLOR = [17, 17, 17];

const TABLE_COLUMNS = [
  { header: 'Data', dataKey: 'data' },
  { header: 'Parcela', dataKey: 'parcela' },
  { header: 'Equipe', dataKey: 'equipe' },
  { header: 'Rua', dataKey: 'rua' },
  { header: 'Cacho/Pl', dataKey: 'cachoPl' },
  { header: 'Cocos Deixados', dataKey: 'cocosDeixados' },
  { header: 'Resp. Levant.', dataKey: 'responsavel' },
  { header: 'Observa\u00e7\u00e3o', dataKey: 'observacao' },
];

const TABLE_COLUMN_STYLES = {
  data: { cellWidth: 18, halign: 'center' },
  parcela: { cellWidth: 20, halign: 'center' },
  equipe: { cellWidth: 14, halign: 'center' },
  rua: { cellWidth: 20, halign: 'center' },
  cachoPl: { cellWidth: 18, halign: 'center' },
  cocosDeixados: { cellWidth: 26, halign: 'center' },
  responsavel: { cellWidth: 34, halign: 'center', overflow: 'linebreak' },
  observacao: { cellWidth: 44, halign: 'center', overflow: 'linebreak' },
};

const createBlankPdfRow = () => ({
  data: '',
  parcela: '',
  equipe: '',
  rua: '',
  cachoPl: '',
  cocosDeixados: '',
  responsavel: '',
  observacao: '',
  highlightCacho: false,
  highlightCocos: false,
});

const formatResponsaveisPdf = (responsaveis = []) => {
  const items = responsaveis.filter(Boolean);
  if (items.length === 0) return '-';
  return items.join('\n');
};

const formatObservacaoColunaPdf = (value = '') => {
  const normalized = String(value || '').trim();
  return normalized || '-';
};

const getReferenteEquipeLinhasPdf = (value = '') => {
  const itens = String(value || '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  const diaReferencia =
    itens.find((item) => item.toLowerCase() !== 'referente a') || '-';

  return ['Referente a', diaReferencia];
};

const getReferenteEquipeLinhaPdf = ({
  referente,
  rowIndex,
  totalRows,
}) => {
  const [titulo, diaReferencia] = getReferenteEquipeLinhasPdf(referente);

  if (totalRows <= 1) {
    return [titulo, diaReferencia].filter(Boolean).join('\n');
  }

  if (rowIndex === 0) {
    return titulo;
  }

  if (rowIndex === 1) {
    return diaReferencia;
  }

  return '';
};

const buildSubtitleText = (dataTitulo, referenteLabel) => {
  const title = String(dataTitulo || '').trim();
  const subtitle = String(referenteLabel || '').trim();

  if (title && subtitle) {
    return `${title} | ${subtitle}`;
  }

  return title || subtitle || '-';
};

const createPdfRows = (page) => {
  const rows = [];
  const body = [];

  page.entries.forEach((entry) => {
    if (entry.type === 'spacer') {
      for (let index = 0; index < entry.count; index += 1) {
        const blankRow = createBlankPdfRow();
        rows.push(blankRow);
        body.push([
          blankRow.data,
          blankRow.parcela,
          blankRow.equipe,
          blankRow.rua,
          blankRow.cachoPl,
          blankRow.cocosDeixados,
          blankRow.responsavel,
          blankRow.observacao,
        ]);
      }
      return;
    }

    entry.rows.forEach((row, index) => {
      const isPrimeiraLinhaEquipe = index === 0;
      const parcelaAnterior = index > 0 ? entry.rows[index - 1]?.parcela : null;
      const isPrimeiraLinhaParcela =
        isPrimeiraLinhaEquipe || parcelaAnterior !== row.parcela;
      const proximaParcela =
        index < entry.rows.length - 1 ? entry.rows[index + 1]?.parcela : null;
      const isUltimaLinhaParcela =
        index === entry.rows.length - 1 || proximaParcela !== row.parcela;
      const observacaoLinhas = [];
      const referenteLinha = getReferenteEquipeLinhaPdf({
        referente: row.referente,
        rowIndex: index,
        totalRows: entry.rows.length,
      });

      if (referenteLinha) {
        observacaoLinhas.push(referenteLinha);
      }
      if (
        isUltimaLinhaParcela &&
        row.parcelaCompleta !== false &&
        row.siglaResumoParcela
      ) {
        observacaoLinhas.push(String(row.siglaResumoParcela).trim());
      }

      const pdfRow = {
        data:
          isPrimeiraLinhaEquipe && row.data
            ? moment(row.data).format('DD/MM/YYYY')
            : '',
        parcela: isPrimeiraLinhaParcela ? row.parcela || '' : '',
        equipe: isPrimeiraLinhaEquipe ? row.equipe || '' : '',
        rua: row.rua || '',
        cachoPl: row.cachoPl || '',
        cocosDeixados: row.cocosDeixados || '',
        responsavel: row.observacao
          ? String(row.observacao).trim()
          : '',
        observacao: observacaoLinhas.length > 0
          ? observacaoLinhas.join('\n')
          : '',
        highlightCacho: row.excedeuCacho,
        highlightCocos: row.excedeuCocos,
      };

      rows.push(pdfRow);

      if (index === 0) {
        body.push([
          pdfRow.data,
          pdfRow.parcela,
          pdfRow.equipe,
          pdfRow.rua,
          pdfRow.cachoPl,
          pdfRow.cocosDeixados,
          pdfRow.responsavel,
          pdfRow.observacao,
        ]);
        return;
      }

      body.push([
        pdfRow.data,
        pdfRow.parcela,
        pdfRow.equipe,
        pdfRow.rua,
        pdfRow.cachoPl,
        pdfRow.cocosDeixados,
        pdfRow.responsavel,
        pdfRow.observacao,
      ]);
    });
  });

  for (let index = 0; index < page.blankRows; index += 1) {
    const blankRow = createBlankPdfRow();
    rows.push(blankRow);
    body.push([
      blankRow.data,
      blankRow.parcela,
      blankRow.equipe,
      blankRow.rua,
      blankRow.cachoPl,
      blankRow.cocosDeixados,
      blankRow.responsavel,
      blankRow.observacao,
    ]);
  }

  return {
    body,
    rows,
  };
};

export const createRelatorioPdfBlob = ({
  dataTitulo,
  referenteLabel,
  footerCode,
  printPages,
}) => {
  const doc = new jsPDF({
    format: 'a4',
    orientation: 'portrait',
    unit: 'mm',
  });

  printPages.forEach((page, pageIndex) => {
    if (pageIndex > 0) {
      doc.addPage();
    }

    const { body, rows: pageRows } = createPdfRows(page);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(TITLE_FONT_SIZE);
    doc.text('Controle de Qualidade de Colheita', doc.internal.pageSize.getWidth() / 2, PAGE_TITLE_Y, {
      align: 'center',
    });

    doc.setFontSize(SUBTITLE_FONT_SIZE);
    doc.text(buildSubtitleText(dataTitulo, referenteLabel), doc.internal.pageSize.getWidth() / 2, PAGE_SUBTITLE_Y, {
      align: 'center',
    });

    autoTable(doc, {
      startY: PAGE_TABLE_START_Y,
      head: [TABLE_COLUMNS.map((column) => column.header)],
      body,
      theme: 'grid',
      margin: {
        left: PAGE_MARGIN_X,
        right: PAGE_MARGIN_X,
      },
      styles: {
        cellPadding: 1.2,
        font: 'helvetica',
        fontSize: BODY_FONT_SIZE,
        halign: 'center',
        lineColor: BORDER_COLOR,
        lineWidth: 0.2,
        minCellHeight: ROW_HEIGHT_MM,
        textColor: TEXT_COLOR,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [255, 255, 255],
        fontSize: HEADER_FONT_SIZE,
        fontStyle: 'bold',
        halign: 'center',
        lineColor: BORDER_COLOR,
        lineWidth: 0.2,
        textColor: TEXT_COLOR,
        valign: 'middle',
      },
      columnStyles: TABLE_COLUMN_STYLES,
      didParseCell: (hook) => {
        if (hook.section !== 'body') {
          return;
        }

        const row = pageRows[hook.row.index];
        const key = TABLE_COLUMNS[hook.column.index]?.dataKey;

        if (!row || !key) {
          return;
        }

        if (
          (key === 'cachoPl' && row.highlightCacho) ||
          (key === 'cocosDeixados' && row.highlightCocos)
        ) {
          hook.cell.styles.fillColor = MARKER_FILL;
          hook.cell.styles.textColor = MARKER_TEXT;
          hook.cell.styles.fontStyle = 'bold';
        }
      },
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FOOTER_FONT_SIZE);
    doc.text(footerCode, PAGE_MARGIN_X, PAGE_FOOTER_Y);
  });

  return doc.output('blob');
};
