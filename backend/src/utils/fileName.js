export const normalizeFileName = (originalName) => {
    // Remove special characters, replace spaces with hyphens
    let nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'));
    const ext = originalName.substring(originalName.lastIndexOf('.'));
    
    if (!nameWithoutExt) {
        nameWithoutExt = originalName;
    }
    
    const cleanName = nameWithoutExt
        .replace(/[^a-zA-Z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
        
    const fileName = `${Date.now()}-${cleanName}${ext}`;
    
    return { fileName, originalName, cleanName };
};
