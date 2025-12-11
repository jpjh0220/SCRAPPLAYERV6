export const cleanTitle = (title: string): string => {
  let cleaned = title;
  
  cleaned = cleaned.replace(/\s*[\(\[]?\s*(?:official|exclusive|premiere)?\s*(?:music|lyric|lyrics|audio|hd|4k)?\s*(?:video|visualizer|audio|mv)?\s*[\)\]]?\s*$/gi, '');
  
  cleaned = cleaned.replace(/\s*[\(\[]\s*(?:official|exclusive)\s*(?:music\s*)?video\s*[\)\]]/gi, '');
  cleaned = cleaned.replace(/\s*[\(\[]\s*(?:official|exclusive)\s*(?:lyric(?:s)?|audio)\s*(?:video)?\s*[\)\]]/gi, '');
  cleaned = cleaned.replace(/\s*[\(\[]\s*(?:official|exclusive)\s*visualizer\s*[\)\]]/gi, '');
  cleaned = cleaned.replace(/\s*[\(\[]\s*(?:music\s*video|mv|m\/v)\s*[\)\]]/gi, '');
  cleaned = cleaned.replace(/\s*[\(\[]\s*(?:audio|lyric(?:s)?)\s*[\)\]]/gi, '');
  cleaned = cleaned.replace(/\s*[\(\[]\s*(?:hd|hq|4k|1080p|720p)\s*[\)\]]/gi, '');
  cleaned = cleaned.replace(/\s*[\(\[]\s*(?:explicit|clean)\s*[\)\]]/gi, '');
  cleaned = cleaned.replace(/\s*[\(\[]\s*(?:prod\.?\s*(?:by\s*)?[^\)\]]+)\s*[\)\]]/gi, '');
  cleaned = cleaned.replace(/\s*[\(\[]\s*(?:dir\.?\s*(?:by\s*)?[^\)\]]+)\s*[\)\]]/gi, '');
  cleaned = cleaned.replace(/\s*[\(\[]\s*(?:shot\s*by\s*[^\)\]]+)\s*[\)\]]/gi, '');
  
  cleaned = cleaned.replace(/\s*[\(\[]\s*[\)\]]/g, '');
  
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
};

export const normalizeArtist = (name: string): string => {
  let normalized = name.trim();
  
  normalized = normalized.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
  normalized = normalized.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
  normalized = normalized.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
  
  normalized = normalized.replace(/\s*[-–—]\s*topic$/i, '');
  normalized = normalized.replace(/\s*[-–—]\s*official$/i, '');
  normalized = normalized.replace(/\s*\(official\)$/i, '');
  normalized = normalized.replace(/\s*\[official\]$/i, '');
  normalized = normalized.replace(/\s*official$/i, '');
  normalized = normalized.replace(/\s*vevo$/i, '');
  
  normalized = normalized.replace(/\s*[\(\[][^\)\]]*(?:official|video|audio|lyrics?|hd|hq|4k|visualizer|explicit|clean|remix|live|session|performance|mv|m\/v)[\)\]]/gi, '');
  normalized = normalized.replace(/\s*[\(\[]\s*[\)\]]/g, '');
  
  normalized = normalized.replace(/[•·|:;!?#@$%^*=+~`<>{}()\[\]\\]/g, ' ');
  normalized = normalized.replace(/["""„‟''‛‹›«»]/g, '');
  
  normalized = normalized.replace(/[^a-zA-Z0-9\s'&.\-]/g, ' ');
  
  normalized = normalized.replace(/\s+/g, ' ').trim();
  normalized = normalized.replace(/^[-–—\s.]+|[-–—\s.]+$/g, '');
  
  return normalized;
};
