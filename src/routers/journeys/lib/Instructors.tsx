import { CrudFetcherKeyMap } from '../../../uikit/crud/CrudFetcher';
import { Instructor } from './Instructor';

export const keyMap: CrudFetcherKeyMap<Instructor> = {
  created_at: (_, val) => ({ key: 'createdAt', value: new Date(val * 1000) }),
  deleted_at: (_, val) => ({ key: 'deletedAt', value: val === null ? null : new Date(val * 1000) }),
};
