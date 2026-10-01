// Parses rubric.txt into [{role, position, name, description, weight}]
export function parseRubric(text) {
  const out = [];
  const sections = [
    { role: 'PM', start: text.indexOf('PRODUCT MANAGER RUBRIC'), end: text.indexOf('SENIOR PRODUCT MANAGER RUBRIC') },
    { role: 'SPM', start: text.indexOf('SENIOR PRODUCT MANAGER RUBRIC'), end: text.indexOf('SCORING GUIDE') },
  ];
  for (const s of sections) {
    const body = text.slice(s.start, s.end);
    const blocks = body.split(/\n\s*\d+\.\s+Criterion name:/).slice(1);
    blocks.forEach((b, i) => {
      const name = b.split('\n')[0].trim();
      const desc = (b.match(/What a strong candidate looks like:([\s\S]*?)Weight:/) || [])[1] || '';
      const weight = parseFloat((b.match(/Weight:\s*(\d+(?:\.\d+)?)%/) || [])[1]);
      out.push({
        role: s.role,
        position: i + 1,
        name,
        description: desc.replace(/\s+/g, ' ').trim(),
        weight,
      });
    });
  }
  return out;
}
