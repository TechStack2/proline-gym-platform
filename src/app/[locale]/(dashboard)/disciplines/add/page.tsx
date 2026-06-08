import { getTranslations } from 'next-intl/server'
import { DisciplineForm } from '../components/discipline-form'

export default async function AddDisciplinePage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const t = await getTranslations('disciplines')

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">{t('add_discipline')}</h1>
      <DisciplineForm locale={locale} />
    </div>
  )
}