import { COUNTRIES, CountryConfig } from "./countries.util";

export const TRANSLATIONS = {
    fr: {
        unknownCommand: "Commande inconnue: {command}, pour voir les commandes disponibles, tapez {prefix}help",
        errorOccurred: "Oops, une erreur s'est produite lors de l'exécution de la commande, veuillez réessayer.",
        botReady: "Prêt!",

        commands: {
            onboard: {
                description: "Obtenir une vidéo d'intégration pour comprendre comment fonctionne le bot",
                example: "onboard"
            },
            help: {
                description: "Obtenir la description des commandes",
                example: "help ping"
            },
            ping: {
                description: "Pinger le bot",
                example: "ping"
            },
            langlist: {
                description: "Obtenir la liste des langues disponibles",
                example: "langlist"
            },
            translate: {
                description: "Traduire du texte",
                example: "translate fr Bonjour les gars!"
            },
            chat: {
                description: "Discuter avec Gemini AI",
                example: "chat Bonjour gemini!"
            },
            meme: {
                description: "Obtenir un mème aléatoire",
                example: "meme"
            },
            joke: {
                description: "Obtenir une blague aléatoire",
                example: "joke"
            },
            get: {
                description: "Télécharger un fichier depuis les réseaux sociaux (TikTok, Instagram, Twitter, Facebook, LinkedIn)",
                example: "get https://www.tiktok.com/@tiktok/video/7521819790185434398"
            },
            meteo: {
                description: "Obtenir la météo pour une ville",
                example: "meteo Paris"
            }
        },

        helpHeader: "Liste des commandes disponibles :",
        helpFooter: "(Pour exécuter une commande, commencez-la par le préfix {prefix})",

        getMessages: {
            invalidUrl: "Veuillez fournir une URL valide pour la vidéo.",
            unsupportedNetwork: "Réseau social non pris en charge.",
            downloading: "Récupération de votre fichier depuis {network} (Taille maximale autorisée {size} Mo)...",
            downloadingUnknown: "Récupération de votre fichier... (Taille maximale autorisée {size} Mo)...",
            downloadError: "Erreur lors du téléchargement du fichier.",
            caption: "Téléchargez vos vidéos TikTok, Instagram, Twitter, Facebook, LinkedIn sur WhatsApp sans filigrane. Envoyez simplement le lien de la vidéo à ce bot https://wa.me/qr/SBHRATABRAZVA1",
            captions: [
                "Téléchargez vos vidéos TikTok, Instagram, Twitter, Facebook, LinkedIn sur WhatsApp sans filigrane. Envoyez simplement le lien de la vidéo à ce bot https://wa.me/qr/SBHRATABRAZVA1",
                "Vous n'avez toujours pas enregistré WhatsBot dans votre liste de contacts? Faites le vite et maintenant ! Sinon vous ne pourrez pas utiliser le bot à l'avenir !",
                "Imaginez un bot qui vous permet de télécharger vos vidéos TikTok, Instagram, Twitter, Facebook, LinkedIn sans filigrane sur WhatsApp. Envoie simplement le lien de la vidéo à ce bot https://wa.me/qr/SBHRATABRAZVA1",
                "Vous ignorez certainement quelques fonctionnalités de WhatsBot. Tapez {prefix}help pour voir ce que WhatsBot peut faire !"
            ],
        },

        onboardMessages: {
            caption: "Bienvenue sur {botName}! \n\nRegardez la vidéo d'introduction pour comprendre comment le bot fonctionne.",
            pleaseHelp: "Pour obtenir de l'aide, tapez {prefix}help"
        }
    },
    en: {
        unknownCommand: "Unknown command: {command}, to see available commands, type {prefix}help",
        errorOccurred: "Oops, something went wrong, kindly retry.",
        botReady: "Ready!",

        commands: {
            onboard: {
                description: "Get an onboarding video to understand how the bot works",
                example: "onboard"
            },
            help: {
                description: "Get command Description",
                example: "help ping"
            },
            ping: {
                description: "Ping the bot",
                example: "ping"
            },
            langlist: {
                description: "Get list of available languages",
                example: "langlist"
            },
            translate: {
                description: "Translate text",
                example: "translate fr Hello guys!"
            },
            chat: {
                description: "Chat with Gemini AI",
                example: "chat Hello gemini!"
            },
            meme: {
                description: "Get random meme",
                example: "meme"
            },
            joke: {
                description: "Get random joke",
                example: "joke"
            },
            get: {
                description: "Download file from social media (TikTok, Instagram, X (Twitter), Pinterest)",
                example: "get https://www.tiktok.com/@tiktok/video/7521819790185434398"
            },
            meteo: {
                description: "Get the weather for a city",
                example: "meteo New York"
            }
        },

        helpHeader: "List of available commands :",
        helpFooter: "(To run a command, kindly start it with the prefix {prefix})",

        getMessages: {
            invalidUrl: "Please provide a valid URL for the video.",
            unsupportedNetwork: "Unsupported social network.",
            downloading: "Getting your file from {network} (Max file size allowed {size} MB)...",
            downloadingUnknown: "Getting your file... (Max file size allowed {size} MB)...",
            downloadError: "Error during file download.",
            caption: "Download your TikTok, Instagram, Twitter, Facebook, LinkedIn videos on WhatsApp without watermark. Just send the video link to this bot https://wa.me/qr/SBHRATABRAZVA1",
            captions: [
                "Download your TikTok, Instagram, Twitter, Facebook, and LinkedIn videos to WhatsApp without a watermark. Simply send the video link to this bot https://wa.me/qr/SBHRATABRAZVA1",
                "Still haven't saved WhatsBot to your contact list? Do it quickly and now! Otherwise, you won't be able to use the bot in the future!",
                "Imagine a bot that lets you download your TikTok, Instagram, Twitter, Facebook, and LinkedIn videos to WhatsApp without a watermark. Simply send the video link to this bot https://wa.me/qr/SBHRATABRAZVA1",
                "You probably don't know some of WhatsBot's features. Type {prefix}help to see what WhatsBot can do!"
            ],
        },

        onboardMessages: {
            caption: "Welcome to {botName}! \n\nWatch the onboarding video to understand how the bot works.",
            pleaseHelp: "To get help, type {prefix}help"
        }
    }
};

export function detectLanguageFromPhone(phoneNumber: string): string {
    if (!phoneNumber) return 'en';

    const cleanNumber = phoneNumber.replace(/\D/g, '');

    for (const country of COUNTRIES) {
        if (cleanNumber.startsWith(country.phonePrefix)) {
            return country.language;
        }
    }

    return 'en';
}

export function translate(language: string, key: string, params: Record<string, string> = {}): string {
    const translations = TRANSLATIONS[language] || TRANSLATIONS['en'];

    const keys = key.split('.');
    let value: any = translations;

    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            value = TRANSLATIONS['en'];
            for (const fallbackKey of keys) {
                if (value && typeof value === 'object' && fallbackKey in value) {
                    value = value[fallbackKey];
                } else {
                    return key;
                }
            }
            break;
        }
    }

    if (typeof value !== 'string') {
        return key;
    }

    let message = value;
    for (const [param, replacement] of Object.entries(params)) {
        message = message.replace(new RegExp(`{${param}}`, 'g'), replacement);
    }

    return message;
}

export function getCountryFromPhone(phoneNumber: string): CountryConfig | null {
    if (!phoneNumber) return null;

    const cleanNumber = phoneNumber.replace(/\D/g, '');

    for (const country of COUNTRIES) {
        if (cleanNumber.startsWith(country.phonePrefix)) {
            return country;
        }
    }

    return null;
}

export class UserI18n {
    private language: string;
    private country: CountryConfig | null;

    constructor(phoneNumber: string) {
        this.language = detectLanguageFromPhone(phoneNumber);
        this.country = getCountryFromPhone(phoneNumber);
    }

    t(key: string, params: Record<string, string> = {}): string {
        return translate(this.language, key, params);
    }

    random(key: string, params: Record<string, string> = {}): string {
        const translations = TRANSLATIONS[this.language] || TRANSLATIONS['en'];

        const keys = key.split('.');
        let value: any = translations;

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                value = TRANSLATIONS['en'];
                for (const fallbackKey of keys) {
                    if (value && typeof value === 'object' && fallbackKey in value) {
                        value = value[fallbackKey];
                    } else {
                        return '';
                    }
                }
                break;
            }
        }

        if (!Array.isArray(value) || value.length === 0) {
            return '';
        }

        const randomIndex = Math.floor(Math.random() * value.length);
        let message = value[randomIndex];

        for (const [param, replacement] of Object.entries(params)) {
            message = message.replace(new RegExp(`{${param}}`, 'g'), replacement);
        }

        return message;
    }

    getLanguage(): string {
        return this.language;
    }

    getCountry(): CountryConfig | null {
        return this.country;
    }

    isFrench(): boolean {
        return this.language === 'fr';
    }

    isEnglish(): boolean {
        return this.language === 'en';
    }
}