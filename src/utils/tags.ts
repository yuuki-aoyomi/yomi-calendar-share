import type { CalendarTag } from '../types/calendar';

const tagTypePriority: Record<CalendarTag['type'], number> = {
  person: 0,
  work: 1,
  'credit-card': 2,
  custom: 3,
};

export const sortCalendarTags = (tags: CalendarTag[]): CalendarTag[] =>
  tags
    .map((tag, index) => ({ tag, index }))
    .sort((a, b) => {
      const priorityDiff = tagTypePriority[a.tag.type] - tagTypePriority[b.tag.type];
      if (priorityDiff !== 0) return priorityDiff;
      return a.index - b.index;
    })
    .map(({ tag }) => tag);

export const findMainTag = (tagIds: string[] | undefined, tags: CalendarTag[]): CalendarTag | undefined => {
  const selectedTags = sortCalendarTags(tags).filter((tag) => (tagIds ?? []).includes(tag.id));
  return selectedTags[0];
};

export const getBirthdayTagsForDate = (tags: CalendarTag[], dateKey: string): CalendarTag[] => {
  const monthDay = dateKey.slice(5);
  return sortCalendarTags(tags).filter((tag) => tag.type === 'person' && tag.birthday?.slice(5) === monthDay);
};
