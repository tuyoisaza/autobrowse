export type Locale = 'en' | 'es' | 'pt';

export const DEFAULT_LOCALE: Locale = 'en';
export const SUPPORTED_LOCALES: Locale[] = ['en', 'es', 'pt'];

export const translations = {
  en: {
    app: {
      title: 'AutoBrowse',
      subtitle: 'Type what you want me to do'
    },
    prompt: {
      placeholder: 'e.g., go to github.com and get the title',
      button: 'Go →',
      loading: 'Working...'
    },
    status: {
      success: 'Success',
      error: 'Error',
      running: 'Running'
    },
    errors: {
      instructionRequired: 'Please provide an instruction',
      connectionError: 'Connection error'
    }
  },
  es: {
    app: {
      title: 'AutoBrowse',
      subtitle: 'Escribe lo que quieres que haga'
    },
    prompt: {
      placeholder: 'ej., ve a github.com y obtén el título',
      button: 'Ir →',
      loading: 'Trabajando...'
    },
    status: {
      success: 'Éxito',
      error: 'Error',
      running: 'Ejecutando'
    },
    errors: {
      instructionRequired: 'Por favor proporciona una instrucción',
      connectionError: 'Error de conexión'
    }
  },
  pt: {
    app: {
      title: 'AutoBrowse',
      subtitle: 'Digite o que você quer que eu faça'
    },
    prompt: {
      placeholder: 'ex., vá para github.com e pegue o título',
      button: 'Ir →',
      loading: 'Trabalhando...'
    },
    status: {
      success: 'Sucesso',
      error: 'Erro',
      running: 'Executando'
    },
    errors: {
      instructionRequired: 'Por favor forneça uma instrução',
      connectionError: 'Erro de conexão'
    }
  }
};

export function t(key: string, locale: Locale = DEFAULT_LOCALE): string {
  const keys = key.split('.');
  let value: any = translations[locale];
  
  for (const k of keys) {
    value = value?.[k];
  }
  
  if (value === undefined) {
    value = translations[DEFAULT_LOCALE];
    for (const k of keys) {
      value = value?.[k];
    }
  }
  
  return value || key;
}

export function detectLocale(header?: string): Locale {
  if (!header) return DEFAULT_LOCALE;
  
  const accept = header.toLowerCase();
  
  if (accept.includes('pt')) return 'pt';
  if (accept.includes('es')) return 'es';
  if (accept.includes('en')) return 'en';
  
  return DEFAULT_LOCALE;
}