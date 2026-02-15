export type ProjectStatus = 'draft' | 'uploading' | 'processing' | 'ready' | 'exported';

export interface Project {
  _id: string;
  userId: string;
  name: string;
  status: ProjectStatus;
  sourceDocuments: string[];
  templateDocument?: string;
  modelDocuments: string[];
  pipelineJobId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  name: string;
}

export interface UpdateProjectInput {
  name?: string;
  status?: ProjectStatus;
}
