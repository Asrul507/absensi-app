function decodeRange(ws) {
  if (!ws || !ws['!ref'] || typeof XLSX === 'undefined') return null
  try { return XLSX.utils.decode_range(ws['!ref']) } catch { return null }
}

function cellText(ws, row, col) {
  if (!ws || typeof XLSX === 'undefined') return ''
  const addr = XLSX.utils.encode_cell({ r: row, c: col })
  const cell = ws[addr]
  if (!cell) return ''
  return String(cell.w ?? cell.v ?? '').trim()
}

function findBestHeaderRow(ws, range) {
  let bestRow = range.s.r
  let bestCount = 0
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    let count = 0
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      if (cellText(ws, r, c)) count += 1
    }
    if (count > bestCount) {
      bestCount = count
      bestRow = r
    }
  }
  return bestCount >= 2 ? bestRow : range.s.r
}

function estimateColumnWidths(ws, range) {
  const widths = []
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    let max = 12
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const len = cellText(ws, r, c).length
      if (len > max) max = len
    }
    widths.push({ wch: Math.min(Math.max(max + 2, 12), 45) })
  }
  return widths
}

function applySheetPresentation(ws) {
  const range = decodeRange(ws)
  if (!range) return
  const headerRow = findBestHeaderRow(ws, range)
  ws['!cols'] = estimateColumnWidths(ws, range)
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRow, c: range.s.c },
      e: { r: range.e.r, c: range.e.c }
    })
  }
  ws['!freeze'] = { xSplit: 0, ySplit: headerRow + 1 }
}

function formatWorkbook(wb) {
  if (!wb || !Array.isArray(wb.SheetNames)) return wb
  wb.SheetNames.forEach(name => applySheetPresentation(wb.Sheets?.[name]))
  return wb
}

function installExcelFormatter() {
  if (typeof XLSX === 'undefined' || !XLSX?.writeFile || XLSX.writeFile.__genproFormatted) return
  const originalWriteFile = XLSX.writeFile.bind(XLSX)
  const wrappedWriteFile = function(workbook, filename, opts) {
    try { formatWorkbook(workbook) } catch (err) { console.warn('Excel formatter skipped:', err) }
    return originalWriteFile(workbook, filename, opts)
  }
  wrappedWriteFile.__genproFormatted = true
  XLSX.writeFile = wrappedWriteFile
}

installExcelFormatter()
document.addEventListener('DOMContentLoaded', installExcelFormatter)
setTimeout(installExcelFormatter, 500)
setTimeout(installExcelFormatter, 1500)
