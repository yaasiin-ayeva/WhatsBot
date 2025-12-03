export interface PhoneDetectionResult {
    countryCode: string;
    region: string;
    primaryLanguage: 'en' | 'fr' | 'other';
    possibleLanguages: string[];
}

const countryLanguageMap: Record<string, PhoneDetectionResult> = {
    '1': { countryCode: '+1', region: 'US/Canada', primaryLanguage: 'en', possibleLanguages: ['en', 'fr'] },
    '33': { countryCode: '+33', region: 'France', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '32': { countryCode: '+32', region: 'Belgium', primaryLanguage: 'fr', possibleLanguages: ['fr', 'nl', 'en'] },
    '41': { countryCode: '+41', region: 'Switzerland', primaryLanguage: 'fr', possibleLanguages: ['fr', 'de', 'it', 'en'] },
    '212': { countryCode: '+212', region: 'Morocco', primaryLanguage: 'fr', possibleLanguages: ['fr', 'ar'] },
    '213': { countryCode: '+213', region: 'Algeria', primaryLanguage: 'fr', possibleLanguages: ['fr', 'ar'] },
    '216': { countryCode: '+216', region: 'Tunisia', primaryLanguage: 'fr', possibleLanguages: ['fr', 'ar'] },
    '221': { countryCode: '+221', region: 'Senegal', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '223': { countryCode: '+223', region: 'Mali', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '225': { countryCode: '+225', region: 'Ivory Coast', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '226': { countryCode: '+226', region: 'Burkina Faso', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '227': { countryCode: '+227', region: 'Niger', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '228': { countryCode: '+228', region: 'Togo', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '229': { countryCode: '+229', region: 'Benin', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '230': { countryCode: '+230', region: 'Mauritius', primaryLanguage: 'fr', possibleLanguages: ['fr', 'en'] },
    '235': { countryCode: '+235', region: 'Chad', primaryLanguage: 'fr', possibleLanguages: ['fr', 'ar'] },
    '236': { countryCode: '+236', region: 'Central African Republic', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '237': { countryCode: '+237', region: 'Cameroon', primaryLanguage: 'fr', possibleLanguages: ['fr', 'en'] },
    '241': { countryCode: '+241', region: 'Gabon', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '242': { countryCode: '+242', region: 'Congo', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '243': { countryCode: '+243', region: 'DR Congo', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '257': { countryCode: '+257', region: 'Burundi', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '261': { countryCode: '+261', region: 'Madagascar', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '262': { countryCode: '+262', region: 'Reunion', primaryLanguage: 'fr', possibleLanguages: ['fr'] },
    '269': { countryCode: '+269', region: 'Comoros', primaryLanguage: 'fr', possibleLanguages: ['fr', 'ar'] },
    '44': { countryCode: '+44', region: 'UK', primaryLanguage: 'en', possibleLanguages: ['en'] },
    '61': { countryCode: '+61', region: 'Australia', primaryLanguage: 'en', possibleLanguages: ['en'] },
    '64': { countryCode: '+64', region: 'New Zealand', primaryLanguage: 'en', possibleLanguages: ['en'] },
    '234': { countryCode: '+234', region: 'Nigeria', primaryLanguage: 'en', possibleLanguages: ['en'] },
    '254': { countryCode: '+254', region: 'Kenya', primaryLanguage: 'en', possibleLanguages: ['en', 'sw'] },
    '255': { countryCode: '+255', region: 'Tanzania', primaryLanguage: 'en', possibleLanguages: ['en', 'sw'] },
    '256': { countryCode: '+256', region: 'Uganda', primaryLanguage: 'en', possibleLanguages: ['en'] },
    '260': { countryCode: '+260', region: 'Zambia', primaryLanguage: 'en', possibleLanguages: ['en'] },
    '263': { countryCode: '+263', region: 'Zimbabwe', primaryLanguage: 'en', possibleLanguages: ['en'] },
    '27': { countryCode: '+27', region: 'South Africa', primaryLanguage: 'en', possibleLanguages: ['en', 'af'] },
    '91': { countryCode: '+91', region: 'India', primaryLanguage: 'en', possibleLanguages: ['en', 'hi'] },
    '353': { countryCode: '+353', region: 'Ireland', primaryLanguage: 'en', possibleLanguages: ['en'] },
    '971': { countryCode: '+971', region: 'UAE', primaryLanguage: 'en', possibleLanguages: ['en', 'ar'] },
};

export class PhoneDetectionUtil {
    static detectLanguageFromPhone(phoneNumber: string): PhoneDetectionResult {
        const cleanNumber = phoneNumber.replace(/[\s\-\(\)@c.us]/g, '');

        if (cleanNumber.startsWith('+')) {
            const number = cleanNumber.substring(1);

            for (const [code, info] of Object.entries(countryLanguageMap)) {
                if (number.startsWith(code)) {
                    return info;
                }
            }
        } else if (cleanNumber.startsWith('00')) {
            const number = cleanNumber.substring(2);

            for (const [code, info] of Object.entries(countryLanguageMap)) {
                if (number.startsWith(code)) {
                    return info;
                }
            }
        } else {
            for (const [code, info] of Object.entries(countryLanguageMap)) {
                if (cleanNumber.startsWith(code)) {
                    return info;
                }
            }
        }

        return {
            countryCode: 'unknown',
            region: 'Unknown',
            primaryLanguage: 'other',
            possibleLanguages: []
        };
    }

    static getLanguageGroup(phoneNumber: string): 'en' | 'fr' | 'other' {
        return this.detectLanguageFromPhone(phoneNumber).primaryLanguage;
    }

    static isEnglishSpeaker(phoneNumber: string): boolean {
        return this.getLanguageGroup(phoneNumber) === 'en';
    }

    static isFrenchSpeaker(phoneNumber: string): boolean {
        return this.getLanguageGroup(phoneNumber) === 'fr';
    }

    static groupContactsByLanguage(contacts: { phoneNumber: string }[]): {
        english: typeof contacts;
        french: typeof contacts;
        other: typeof contacts;
    } {
        const grouped = {
            english: [] as typeof contacts,
            french: [] as typeof contacts,
            other: [] as typeof contacts
        };

        contacts.forEach(contact => {
            const lang = this.getLanguageGroup(contact.phoneNumber);
            if (lang === 'en') {
                grouped.english.push(contact);
            } else if (lang === 'fr') {
                grouped.french.push(contact);
            } else {
                grouped.other.push(contact);
            }
        });

        return grouped;
    }
}
