import {getAllPropertyNames, SYSTEM_SORT_FIELDS} from "../data/query";

export async function validateAndSetDefaultSortField(sortField: string) {
    if (!sortField || sortField.trim() === '') {
        console.log('Sort field is empty, using default: filename');
        return 'filename';
    }

    const trimmedSortField: string = sortField.trim();

    if (trimmedSortField === 'filename') {
        return 'filename';
    }

    // DB 그래프 시스템 필드는 언더스코어 표기도 허용
    const commonSystemFields: string[] = [
        ...SYSTEM_SORT_FIELDS,
        'created_at', 'updated_at', 'journal_day'
    ];

    if (commonSystemFields.includes(trimmedSortField)) {
        console.log(`Using system field: ${trimmedSortField}`);
        return trimmedSortField;
    }

    try {
        const allProperties: string[] = await getAllPropertyNames();

        const normalizedField: string = trimmedSortField.toLowerCase();
        const validProperty: string | undefined = allProperties.find((prop: string) =>
            prop.toLowerCase() === normalizedField
        );

        if (validProperty) {
            console.log(`Valid property found: ${validProperty}`);
            return validProperty;
        }

        console.warn(`Invalid sort field: ${trimmedSortField}, falling back to filename`);
        logseq.UI.showMsg(`Invalid sort field "${trimmedSortField}", using filename instead`, 'warning');
        return 'filename';

    } catch (error) {
        console.error('Error validating sort field:', error);
        console.log('Error occurred during validation, using default: filename');
        return 'filename';
    }
}
