const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ExportService {
  constructor() {
    this.exportDir = path.join(__dirname, '../../exports');
    this.ensureExportDir();
  }

  async ensureExportDir() {
    try {
      await fs.mkdir(this.exportDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create export directory:', error);
    }
  }

  generateFilename(baseName, extension) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = baseName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    return `${safeName}_${timestamp}.${extension}`;
  }

  // Export to Markdown
  async exportToMarkdown(content, title = 'export') {
    const filename = this.generateFilename(title, 'md');
    const filepath = path.join(this.exportDir, filename);
    
    // Add title if not present
    let mdContent = content;
    if (!content.startsWith('#')) {
      mdContent = `# ${title}\n\n${content}`;
    }
    
    await fs.writeFile(filepath, mdContent, 'utf8');
    
    return {
      success: true,
      filename,
      filepath,
      format: 'markdown',
      size: Buffer.byteLength(mdContent, 'utf8')
    };
  }

  // Export to PDF (requires pandoc)
  async exportToPDF(content, title = 'export') {
    const mdFilename = this.generateFilename(title, 'md');
    const pdfFilename = mdFilename.replace('.md', '.pdf');
    const mdPath = path.join(this.exportDir, mdFilename);
    const pdfPath = path.join(this.exportDir, pdfFilename);

    // Write markdown first
    let mdContent = content;
    if (!content.startsWith('#')) {
      mdContent = `# ${title}\n\n${content}`;
    }
    await fs.writeFile(mdPath, mdContent, 'utf8');

    try {
      // Check if pandoc is available
      await execAsync('which pandoc');
      
      // Convert to PDF
      await execAsync(`pandoc "${mdPath}" -o "${pdfPath}" --pdf-engine=pdflatex -V geometry:margin=1in`);
      
      // Clean up markdown file
      await fs.unlink(mdPath);
      
      const stats = await fs.stat(pdfPath);
      
      return {
        success: true,
        filename: pdfFilename,
        filepath: pdfPath,
        format: 'pdf',
        size: stats.size
      };
    } catch (error) {
      // Pandoc not available, return markdown instead
      console.log('Pandoc not available, returning markdown');
      return {
        success: true,
        filename: mdFilename,
        filepath: mdPath,
        format: 'markdown',
        note: 'PDF export requires pandoc. Exported as Markdown instead.',
        size: Buffer.byteLength(mdContent, 'utf8')
      };
    }
  }

  // Export to CSV
  async exportToCSV(data, title = 'export') {
    const filename = this.generateFilename(title, 'csv');
    const filepath = path.join(this.exportDir, filename);

    let csvContent = '';

    if (Array.isArray(data) && data.length > 0) {
      // Array of objects
      if (typeof data[0] === 'object') {
        const headers = Object.keys(data[0]);
        csvContent = headers.join(',') + '\n';
        csvContent += data.map(row => 
          headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(',')
        ).join('\n');
      } else {
        // Array of arrays or primitives
        csvContent = data.map(row => 
          Array.isArray(row) ? row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') : `"${row}"`
        ).join('\n');
      }
    } else if (typeof data === 'string') {
      // Parse string as CSV-like content
      csvContent = data;
    }

    await fs.writeFile(filepath, csvContent, 'utf8');

    return {
      success: true,
      filename,
      filepath,
      format: 'csv',
      rows: data.length || 0,
      size: Buffer.byteLength(csvContent, 'utf8')
    };
  }

  // Export to JSON
  async exportToJSON(data, title = 'export') {
    const filename = this.generateFilename(title, 'json');
    const filepath = path.join(this.exportDir, filename);

    const jsonContent = JSON.stringify(data, null, 2);
    await fs.writeFile(filepath, jsonContent, 'utf8');

    return {
      success: true,
      filename,
      filepath,
      format: 'json',
      size: Buffer.byteLength(jsonContent, 'utf8')
    };
  }

  // Export to plain text
  async exportToText(content, title = 'export') {
    const filename = this.generateFilename(title, 'txt');
    const filepath = path.join(this.exportDir, filename);

    // Strip markdown formatting for plain text
    const textContent = content
      .replace(/#{1,6}\s/g, '')  // Remove headers
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove bold
      .replace(/\*([^*]+)\*/g, '$1')  // Remove italics
      .replace(/`([^`]+)`/g, '$1')  // Remove inline code
      .replace(/```[\s\S]*?```/g, '')  // Remove code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');  // Remove links

    await fs.writeFile(filepath, textContent, 'utf8');

    return {
      success: true,
      filename,
      filepath,
      format: 'text',
      size: Buffer.byteLength(textContent, 'utf8')
    };
  }

  // Export chat history
  async exportChatHistory(messages, title = 'chat_history') {
    let content = `# Chat History\n\nExported: ${new Date().toISOString()}\n\n---\n\n`;
    
    for (const msg of messages) {
      const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
      content += `## ${role}\n\n${msg.content}\n\n---\n\n`;
    }

    return this.exportToMarkdown(content, title);
  }

  // Export research report
  async exportResearchReport(research, format = 'markdown') {
    const title = `research_${research.question.substring(0, 30)}`;
    
    let content = `# Research Report\n\n`;
    content += `**Question:** ${research.question}\n\n`;
    content += `**Date:** ${new Date().toISOString()}\n\n---\n\n`;
    content += `## Summary\n\n${research.synthesis || research.answer}\n\n`;
    
    if (research.sources && research.sources.length > 0) {
      content += `## Sources\n\n`;
      research.sources.forEach((s, i) => {
        content += `${i + 1}. [${s.title}](${s.url})\n`;
      });
    }

    switch (format) {
      case 'pdf':
        return this.exportToPDF(content, title);
      case 'json':
        return this.exportToJSON(research, title);
      default:
        return this.exportToMarkdown(content, title);
    }
  }

  // List all exports
  async listExports() {
    try {
      const files = await fs.readdir(this.exportDir);
      const exports = [];

      for (const file of files) {
        const filepath = path.join(this.exportDir, file);
        const stats = await fs.stat(filepath);
        exports.push({
          filename: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
      }

      return exports.sort((a, b) => b.modified - a.modified);
    } catch (error) {
      return [];
    }
  }

  // Delete an export
  async deleteExport(filename) {
    const filepath = path.join(this.exportDir, filename);
    
    // Security: ensure file is in export directory
    if (!filepath.startsWith(this.exportDir)) {
      throw new Error('Invalid filename');
    }

    await fs.unlink(filepath);
    return { success: true, deleted: filename };
  }

  // Get file path for download
  getFilePath(filename) {
    const filepath = path.join(this.exportDir, filename);
    
    // Security check
    if (!filepath.startsWith(this.exportDir)) {
      throw new Error('Invalid filename');
    }

    return filepath;
  }
}

module.exports = ExportService;
